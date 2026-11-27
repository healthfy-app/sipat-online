using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// One training: a company's training keeps its content in a training of its own (PlatformCourses, owned by the
    /// company), whose Títulos are its days, each with its date. The days kept apart (SipatPlans) and the copy opened in
    /// the video editor (SipatWeekCourses) become that one training and both tables go away. A day keeps its id as the id
    /// of its Título, so the days already delivered to the participants are still found when the training is published again.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261204100000_UnifyTrainings")]
    public partial class UnifyTrainings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "TenantId", schema: "learning", table: "PlatformCourses", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<bool>(name: "IsReadySipat", schema: "learning", table: "PlatformCourses", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<DateOnly>(name: "Date", schema: "learning", table: "PlatformCourseLessons", type: "date", nullable: true);
            migrationBuilder.AddColumn<string>(name: "Subject", schema: "learning", table: "PlatformCourseLessons", type: "character varying(120)", maxLength: 120, nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "CourseId", schema: "sipats", table: "SipatEvents", type: "uuid", nullable: true);

            migrationBuilder.Sql("""
                -- the copy opened in the video editor, where it still exists, is the training
                UPDATE sipats."SipatEvents" AS event SET "CourseId" = week."CourseId"
                FROM learning."SipatWeekCourses" AS week
                WHERE week."SipatEventId" = event."Id"
                  AND EXISTS (SELECT 1 FROM learning."PlatformCourses" AS course WHERE course."Id" = week."CourseId");

                -- every other training of a company gets one, empty, with its name
                CREATE TEMP TABLE unify_new_courses ON COMMIT DROP AS
                    SELECT "Id" AS event_id, gen_random_uuid() AS course_id FROM sipats."SipatEvents" WHERE "CourseId" IS NULL;
                INSERT INTO learning."PlatformCourses" ("Id", "Title", "CreatedAt", "Status", "GamificationEnabled", "GameType")
                    SELECT created.course_id, COALESCE(NULLIF(left(btrim(event."Title"), 200), ''), 'Treinamento'), event."CreatedAt", 0, false, 0
                    FROM unify_new_courses AS created JOIN sipats."SipatEvents" AS event ON event."Id" = created.event_id;
                UPDATE sipats."SipatEvents" AS event SET "CourseId" = created.course_id
                FROM unify_new_courses AS created WHERE created.event_id = event."Id";
                UPDATE learning."PlatformCourses" AS course SET "TenantId" = event."TenantId"
                FROM sipats."SipatEvents" AS event WHERE event."CourseId" = course."Id";

                -- the days as they were saved, one row per day
                CREATE TEMP TABLE unify_days ON COMMIT DROP AS
                    SELECT event."CourseId" AS course_id,
                           (item.ord - 1)::int AS position,
                           CASE WHEN item.day->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                     AND item.day->>'id' <> '00000000-0000-0000-0000-000000000000'
                                THEN (item.day->>'id')::uuid ELSE gen_random_uuid() END AS day_id,
                           COALESCE(NULLIF(left(btrim(item.day->>'title'), 200), ''), 'Dia ' || item.ord) AS title,
                           CASE WHEN item.day->>'date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (item.day->>'date')::date END AS day_date,
                           NULLIF(left(btrim(item.day->>'subject'), 120), '') AS subject,
                           CASE WHEN jsonb_typeof(item.day->'videoIds') = 'array' THEN item.day->'videoIds' ELSE '[]'::jsonb END AS video_ids,
                           CASE WHEN jsonb_typeof(item.day->'gameIds') = 'array' THEN item.day->'gameIds' ELSE '[]'::jsonb END AS game_ids
                    FROM learning."SipatPlans" AS plan
                    JOIN sipats."SipatEvents" AS event ON event."Id" = plan."SipatEventId"
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(plan."DaysJson"::jsonb) = 'array' THEN plan."DaysJson"::jsonb ELSE '[]'::jsonb END)
                        WITH ORDINALITY AS item(day, ord);
                -- a day id used twice (or already the id of a Título somewhere) cannot be a Título's id: it gets a new one
                UPDATE unify_days AS day SET day_id = gen_random_uuid()
                WHERE EXISTS (SELECT 1 FROM learning."PlatformCourseLessons" AS lesson WHERE lesson."Id" = day.day_id)
                   OR EXISTS (SELECT 1 FROM unify_days AS other WHERE other.day_id = day.day_id
                              AND (other.course_id, other.position) < (day.course_id, day.position));

                -- a training that already has Títulos (it was edited in the video editor) keeps them: they are the days.
                -- Each takes, by position, the id, the date and the assunto of its day.
                CREATE TEMP TABLE unify_kept ON COMMIT DROP AS
                    SELECT DISTINCT day.course_id FROM unify_days AS day
                    WHERE EXISTS (SELECT 1 FROM learning."PlatformCourseLessons" AS lesson WHERE lesson."CourseId" = day.course_id);
                CREATE TEMP TABLE unify_lesson_map ON COMMIT DROP AS
                    SELECT lesson."Id" AS old_id, day.day_id AS new_id, day.day_date, day.subject
                    FROM (SELECT existing."Id", existing."CourseId",
                                 (ROW_NUMBER() OVER (PARTITION BY existing."CourseId" ORDER BY existing."Position", existing."Id") - 1)::int AS position
                          FROM learning."PlatformCourseLessons" AS existing
                          WHERE existing."CourseId" IN (SELECT course_id FROM unify_kept)) AS lesson
                    JOIN unify_days AS day ON day.course_id = lesson."CourseId" AND day.position = lesson.position;
                INSERT INTO learning."PlatformCourseLessons" ("Id", "CourseId", "Title", "Description", "Position", "Date", "Subject")
                    SELECT map.new_id, lesson."CourseId", lesson."Title", lesson."Description", lesson."Position", map.day_date, map.subject
                    FROM unify_lesson_map AS map JOIN learning."PlatformCourseLessons" AS lesson ON lesson."Id" = map.old_id;
                UPDATE learning."PlatformCourseVideoLinks" AS link SET "LessonId" = map.new_id
                FROM unify_lesson_map AS map WHERE link."LessonId" = map.old_id;
                DELETE FROM learning."PlatformCourseLessons" WHERE "Id" IN (SELECT old_id FROM unify_lesson_map);

                -- a training without Títulos gets its days as Títulos, with their videos and activities
                CREATE TEMP TABLE unify_fresh ON COMMIT DROP AS
                    SELECT day.* FROM unify_days AS day WHERE day.course_id NOT IN (SELECT course_id FROM unify_kept);
                DELETE FROM learning."PlatformCourseVideoLinks" WHERE "CourseId" IN (SELECT course_id FROM unify_fresh);
                DELETE FROM learning."PlatformCourseModuleLinks" WHERE "CourseId" IN (SELECT course_id FROM unify_fresh);
                INSERT INTO learning."PlatformCourseLessons" ("Id", "CourseId", "Title", "Position", "Date", "Subject")
                    SELECT day_id, course_id, title, position, day_date, subject FROM unify_fresh;

                -- a training holds each video once: a video on two days stays on the first one
                CREATE TEMP TABLE unify_videos ON COMMIT DROP AS
                    SELECT DISTINCT ON (picked.course_id, picked.video_id) picked.*
                    FROM (SELECT day.course_id, day.day_id, day.position AS day_position, video.ord, video.value::uuid AS video_id
                          FROM unify_fresh AS day
                          CROSS JOIN LATERAL jsonb_array_elements_text(day.video_ids) WITH ORDINALITY AS video(value, ord)
                          WHERE video.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS picked
                    JOIN learning."PlatformCourseVideos" AS existing ON existing."Id" = picked.video_id
                    ORDER BY picked.course_id, picked.video_id, picked.day_position, picked.ord;
                INSERT INTO learning."PlatformCourseVideoLinks" ("CourseId", "VideoId", "Position", "LessonId")
                    SELECT course_id, video_id,
                           (ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY day_position, ord) - 1)::int, day_id
                    FROM unify_videos;

                -- a day's activities come after its last video
                INSERT INTO learning."PlatformCourseModuleLinks" ("Id", "CourseId", "ModuleId", "AfterVideoCount", "Order")
                    SELECT gen_random_uuid(), day.course_id, module."Id",
                           (SELECT COUNT(*) FROM unify_videos AS video
                            WHERE video.course_id = day.course_id AND video.day_position <= day.position)::int,
                           (game.ord - 1)::int
                    FROM unify_fresh AS day
                    CROSS JOIN LATERAL (SELECT DISTINCT ON (value) value, ord FROM jsonb_array_elements_text(day.game_ids) WITH ORDINALITY AS listed(value, ord)
                                        WHERE value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                        ORDER BY value, ord) AS game
                    JOIN learning."GameModules" AS module ON module."Id" = game.value::uuid;
                """);

            migrationBuilder.AlterColumn<Guid>(name: "CourseId", schema: "sipats", table: "SipatEvents", type: "uuid", nullable: false,
                oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
            migrationBuilder.CreateIndex(name: "IX_SipatEvents_CourseId", schema: "sipats", table: "SipatEvents", column: "CourseId", unique: true);
            migrationBuilder.AddForeignKey(name: "FK_SipatEvents_PlatformCourses_CourseId", schema: "sipats", table: "SipatEvents", column: "CourseId",
                principalSchema: "learning", principalTable: "PlatformCourses", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            migrationBuilder.CreateIndex(name: "IX_PlatformCourses_TenantId", schema: "learning", table: "PlatformCourses", column: "TenantId");

            migrationBuilder.DropTable(name: "SipatWeekCourses", schema: "learning");
            migrationBuilder.DropTable(name: "SipatPlans", schema: "learning");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
