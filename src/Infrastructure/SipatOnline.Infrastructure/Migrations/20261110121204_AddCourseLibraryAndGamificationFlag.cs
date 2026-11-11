using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseLibraryAndGamificationFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PlatformCourseVideos_PlatformCourses_CourseId",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropIndex(
                name: "IX_PlatformCourseVideos_CourseId_CreatedAt",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.AddColumn<bool>(
                name: "GamificationEnabled",
                schema: "learning",
                table: "PlatformCourses",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                schema: "learning",
                table: "PlatformCourses",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "PlatformCourseVideoLinks",
                schema: "learning",
                columns: table => new
                {
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformCourseVideoLinks", x => new { x.CourseId, x.VideoId });
                    table.ForeignKey(
                        name: "FK_PlatformCourseVideoLinks_PlatformCourseVideos_VideoId",
                        column: x => x.VideoId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourseVideos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PlatformCourseVideoLinks_PlatformCourses_CourseId",
                        column: x => x.CourseId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideos_CreatedAt",
                schema: "learning",
                table: "PlatformCourseVideos",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideoLinks_CourseId_Position",
                schema: "learning",
                table: "PlatformCourseVideoLinks",
                columns: new[] { "CourseId", "Position" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideoLinks_VideoId",
                schema: "learning",
                table: "PlatformCourseVideoLinks",
                column: "VideoId");

            // Preserve existing course/video associations before the legacy column is dropped.
            migrationBuilder.Sql("""
                INSERT INTO learning."PlatformCourseVideoLinks" ("CourseId", "VideoId", "Position")
                SELECT "CourseId", "Id",
                    (ROW_NUMBER() OVER (PARTITION BY "CourseId" ORDER BY "CreatedAt", "Id") - 1)::integer
                FROM learning."PlatformCourseVideos";
                """);

            migrationBuilder.DropColumn(
                name: "CourseId",
                schema: "learning",
                table: "PlatformCourseVideos");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformCourseVideoLinks",
                schema: "learning");

            migrationBuilder.DropIndex(
                name: "IX_PlatformCourseVideos_CreatedAt",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "GamificationEnabled",
                schema: "learning",
                table: "PlatformCourses");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "learning",
                table: "PlatformCourses");

            migrationBuilder.AddColumn<Guid>(
                name: "CourseId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE learning."PlatformCourseVideos" v
                SET "CourseId" = (
                    SELECT l."CourseId" FROM learning."PlatformCourseVideoLinks" l
                    WHERE l."VideoId" = v."Id" ORDER BY l."Position" LIMIT 1);
                DELETE FROM learning."PlatformCourseVideos" WHERE "CourseId" IS NULL;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "CourseId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideos_CourseId_CreatedAt",
                schema: "learning",
                table: "PlatformCourseVideos",
                columns: new[] { "CourseId", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_PlatformCourseVideos_PlatformCourses_CourseId",
                schema: "learning",
                table: "PlatformCourseVideos",
                column: "CourseId",
                principalSchema: "learning",
                principalTable: "PlatformCourses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
