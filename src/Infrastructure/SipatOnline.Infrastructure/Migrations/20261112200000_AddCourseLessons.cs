using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112200000_AddCourseLessons")]
public sealed class AddCourseLessons : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "PlatformCourseLessons",
            schema: "learning",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                Position = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PlatformCourseLessons", item => item.Id);
                table.ForeignKey(
                    name: "FK_PlatformCourseLessons_PlatformCourses_CourseId",
                    column: item => item.CourseId,
                    principalSchema: "learning",
                    principalTable: "PlatformCourses",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.AddColumn<Guid>(
            name: "LessonId", schema: "learning", table: "PlatformCourseVideoLinks", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<string>(
            name: "TitleOverride", schema: "learning", table: "PlatformCourseVideoLinks",
            type: "character varying(200)", maxLength: 200, nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_PlatformCourseLessons_CourseId_Position", schema: "learning",
            table: "PlatformCourseLessons", columns: new[] { "CourseId", "Position" });
        migrationBuilder.CreateIndex(
            name: "IX_PlatformCourseVideoLinks_LessonId", schema: "learning",
            table: "PlatformCourseVideoLinks", column: "LessonId");
        migrationBuilder.AddForeignKey(
            name: "FK_PlatformCourseVideoLinks_PlatformCourseLessons_LessonId",
            schema: "learning", table: "PlatformCourseVideoLinks", column: "LessonId",
            principalSchema: "learning", principalTable: "PlatformCourseLessons", principalColumn: "Id",
            onDelete: ReferentialAction.SetNull);

        // Cursos que já existem: todos os vídeos atuais viram a "Aula 1".
        migrationBuilder.Sql("""
            INSERT INTO learning."PlatformCourseLessons" ("Id", "CourseId", "Title", "Position")
            SELECT gen_random_uuid(), c."Id", 'Aula 1', 0
            FROM learning."PlatformCourses" c
            WHERE EXISTS (SELECT 1 FROM learning."PlatformCourseVideoLinks" l WHERE l."CourseId" = c."Id");

            UPDATE learning."PlatformCourseVideoLinks" l
            SET "LessonId" = (SELECT x."Id" FROM learning."PlatformCourseLessons" x WHERE x."CourseId" = l."CourseId" LIMIT 1);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_PlatformCourseVideoLinks_PlatformCourseLessons_LessonId",
            schema: "learning", table: "PlatformCourseVideoLinks");
        migrationBuilder.DropIndex(name: "IX_PlatformCourseVideoLinks_LessonId", schema: "learning", table: "PlatformCourseVideoLinks");
        migrationBuilder.DropColumn(name: "TitleOverride", schema: "learning", table: "PlatformCourseVideoLinks");
        migrationBuilder.DropColumn(name: "LessonId", schema: "learning", table: "PlatformCourseVideoLinks");
        migrationBuilder.DropTable(name: "PlatformCourseLessons", schema: "learning");
    }
}
