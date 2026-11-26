using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

/// <summary>
/// The trainings that existed before "one training" (days kept apart, a copy opened in the video editor) come out of
/// the migration as one training each, owned by the company, whose Títulos are the days with the same ids.
/// </summary>
public sealed class UnifyTrainingsMigrationTests
{
    private const string Before = "20261203100000_CountExternalVideosWithLength";

    [DockerFact]
    public async Task Existing_trainings_become_one_training_each_with_their_days_as_titulos()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseNpgsql(postgres.GetConnectionString(), npgsql => npgsql.MigrationsAssembly(typeof(PlatformDbContext).Assembly.FullName))
            .Options;

        Guid tenant = Guid.NewGuid(), v1 = Guid.NewGuid(), v2 = Guid.NewGuid(), v3 = Guid.NewGuid(), game = Guid.NewGuid();
        Guid edited = Guid.NewGuid(), editedCourse = Guid.NewGuid(), oldLesson1 = Guid.NewGuid(), oldLesson2 = Guid.NewGuid();
        Guid editedDay1 = Guid.NewGuid(), editedDay2 = Guid.NewGuid();
        Guid planned = Guid.NewGuid(), plannedDay1 = Guid.NewGuid(), plannedDay2 = Guid.NewGuid();
        Guid empty = Guid.NewGuid();
        Guid orphan = Guid.NewGuid(), orphanDay = Guid.NewGuid();

        await using (var db = new PlatformDbContext(options))
        {
            await db.GetService<IMigrator>().MigrateAsync(Before);
            // the company goes in by hand: its table gained columns after this point, which the current model would try to write
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO tenancy."Tenants" ("Id", "Key", "Name", "PrimaryColor", "SecondaryColor", "CreatedAt", "IsActive", "Plan")
                VALUES ({tenant}, 'damare', 'Damare', '#123456', '#654321', now(), true, 3)
                """);
            // the videos go in by hand too: their table gained the picture's columns after this point
            foreach (var (id, title) in new[] { (v1, "Um"), (v2, "Dois"), (v3, "Três") })
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO learning."PlatformCourseVideos" ("Id", "Title", "ContentType", "SizeBytes", "DurationMilliseconds", "CreatedAt")
                    VALUES ({id}, {title}, 'video/mp4', 1000, 60000, now())
                    """);
            // the game goes in by hand as well: its table gained the owner company after this point
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO learning."GameModules" ("Id", "Title", "GameType", "QuestionsJson", "CreatedAt")
                VALUES ({game}, 'Quiz', 0, '[]', now())
                """);

            foreach (var (id, title) in new[] { (edited, "Editado"), (planned, "Planejado"), (empty, "Vazio"), (orphan, "Órfão") })
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    INSERT INTO sipats."SipatEvents" ("Id", "TenantId", "Title", "StartsAt", "EndsAt", "CreatedAt", "Status")
                    VALUES ({id}, {tenant}, {title}, now(), now() + interval '5 days', now(), 'Published')
                    """);

            // edited in the video editor: the copy has its own Títulos, renamed there
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO learning."PlatformCourses" ("Id", "Title", "CreatedAt") VALUES ({editedCourse}, 'Editado', now());
                INSERT INTO learning."PlatformCourseLessons" ("Id", "CourseId", "Title", "Position")
                    VALUES ({oldLesson1}, {editedCourse}, 'Segunda editada', 0), ({oldLesson2}, {editedCourse}, 'Terça', 1);
                INSERT INTO learning."PlatformCourseVideoLinks" ("CourseId", "VideoId", "Position", "LessonId")
                    VALUES ({editedCourse}, {v1}, 0, {oldLesson1}), ({editedCourse}, {v2}, 1, {oldLesson2});
                INSERT INTO learning."SipatWeekCourses" ("SipatEventId", "TenantId", "CourseId") VALUES ({edited}, {tenant}, {editedCourse});
                INSERT INTO learning."SipatWeekCourses" ("SipatEventId", "TenantId", "CourseId") VALUES ({orphan}, {tenant}, {Guid.NewGuid()});
                """);
            await AddPlanAsync(db, edited, tenant, $$"""
                [{"id":"{{editedDay1}}","title":"Dia 1","date":"2026-12-01","subject":"Ergonomia","videoIds":["{{v1}}"],"gameIds":[]},
                 {"id":"{{editedDay2}}","title":"Dia 2","date":"2026-12-02","subject":null,"videoIds":["{{v2}}"],"gameIds":[]}]
                """);
            // a game in the middle of video 1, from before the games belonged to a training
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO learning."PlatformVideoCheckpoints" ("Id", "VideoId", "ModuleId", "TimeMilliseconds") VALUES ({Guid.NewGuid()}, {v1}, {game}, 30000)
                """);
            // never opened in the editor: a video on two days, a game, a video that no longer exists, a list left null
            await AddPlanAsync(db, planned, tenant, $$"""
                [{"id":"{{plannedDay1}}","title":"Abertura","date":"2026-12-07","subject":"Segurança","videoIds":["{{v1}}","{{v2}}"],"gameIds":["{{game}}"]},
                 {"id":"{{plannedDay2}}","title":"Encerramento","date":null,"subject":"","videoIds":["{{v2}}","{{v3}}","{{Guid.NewGuid()}}"],"gameIds":null}]
                """);
            await AddPlanAsync(db, orphan, tenant, $$"""
                [{"id":"{{orphanDay}}","title":"Único","date":"2026-12-09","subject":null,"videoIds":["{{v3}}"],"gameIds":[]}]
                """);
        }

        await using (var db = new PlatformDbContext(options))
        {
            await db.Database.MigrateAsync();

            var events = await db.SipatEvents.AsNoTracking().ToDictionaryAsync(item => item.Id);
            Assert.Equal(4, events.Values.Select(item => item.CourseId).Distinct().Count());
            foreach (var item in events.Values)
                Assert.Equal(tenant, (await db.PlatformCourses.AsNoTracking().SingleAsync(course => course.Id == item.CourseId)).TenantId);

            // the edited copy is the training: its Títulos keep their names and take the days' ids, dates and assuntos
            Assert.Equal(editedCourse, events[edited].CourseId);
            var editedLessons = await LessonsAsync(db, editedCourse);
            Assert.Equal([editedDay1, editedDay2], editedLessons.Select(lesson => lesson.Id));
            Assert.Equal(["Segunda editada", "Terça"], editedLessons.Select(lesson => lesson.Title));
            Assert.Equal([new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 2)], editedLessons.Select(lesson => lesson.Date!.Value));
            Assert.Equal("Ergonomia", editedLessons[0].Subject);
            Assert.Equal([(v1, (Guid?)editedDay1), (v2, editedDay2)], await LinksAsync(db, editedCourse));

            // the planned one gets a training with its days; the repeated video stays on the first day
            var plannedCourse = events[planned].CourseId;
            Assert.Equal("Planejado", (await db.PlatformCourses.AsNoTracking().SingleAsync(course => course.Id == plannedCourse)).Title);
            var plannedLessons = await LessonsAsync(db, plannedCourse);
            Assert.Equal([plannedDay1, plannedDay2], plannedLessons.Select(lesson => lesson.Id));
            Assert.Equal(["Abertura", "Encerramento"], plannedLessons.Select(lesson => lesson.Title));
            Assert.Equal(new DateOnly(2026, 12, 7), plannedLessons[0].Date);
            Assert.Null(plannedLessons[1].Date);
            Assert.Null(plannedLessons[1].Subject);
            Assert.Equal([(v1, (Guid?)plannedDay1), (v2, plannedDay1), (v3, plannedDay2)], await LinksAsync(db, plannedCourse));
            var activity = await db.PlatformCourseModuleLinks.AsNoTracking().SingleAsync(link => link.CourseId == plannedCourse);
            Assert.Equal(game, activity.ModuleId);
            Assert.Equal(2, activity.AfterVideoCount);

            Assert.Empty(await LessonsAsync(db, events[empty].CourseId));

            // the copy that was deleted from Conteúdo: the days make a new training
            Assert.Equal([orphanDay], (await LessonsAsync(db, events[orphan].CourseId)).Select(lesson => lesson.Id));
            Assert.Equal([(v3, (Guid?)orphanDay)], await LinksAsync(db, events[orphan].CourseId));

            // every training that has video 1 keeps its game in the middle, as its own
            var stops = await db.PlatformVideoCheckpoints.AsNoTracking().Where(stop => stop.VideoId == v1).Select(stop => stop.CourseId).ToListAsync();
            Assert.Equal(new[] { editedCourse, plannedCourse }.Order(), stops.Order());

            var left = await db.Database.SqlQueryRaw<int>("""
                SELECT COUNT(*)::int AS "Value" FROM information_schema.tables
                WHERE table_schema = 'learning' AND table_name IN ('SipatPlans', 'SipatWeekCourses')
                """).SingleAsync();
            Assert.Equal(0, left);
        }
    }

    private static Task<int> AddPlanAsync(PlatformDbContext db, Guid sipat, Guid tenant, string days) =>
        db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO learning."SipatPlans" ("SipatEventId", "TenantId", "DaysJson", "UpdatedAt") VALUES ({sipat}, {tenant}, {days}, now())
            """);

    private static Task<List<PlatformCourseLessonEntity>> LessonsAsync(PlatformDbContext db, Guid course) =>
        db.PlatformCourseLessons.AsNoTracking().Where(lesson => lesson.CourseId == course).OrderBy(lesson => lesson.Position).ToListAsync();

    private static async Task<(Guid, Guid?)[]> LinksAsync(PlatformDbContext db, Guid course) =>
        (await db.PlatformCourseVideoLinks.AsNoTracking().Where(link => link.CourseId == course).OrderBy(link => link.Position).ToListAsync())
            .Select(link => (link.VideoId, link.LessonId)).ToArray();
}
