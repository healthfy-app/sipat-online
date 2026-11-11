using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformCourseCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlatformCourses",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformCourses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformCourseVideos",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    DurationMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformCourseVideos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformCourseVideos_PlatformCourses_CourseId",
                        column: x => x.CourseId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourses_CreatedAt",
                schema: "learning",
                table: "PlatformCourses",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideos_CourseId_CreatedAt",
                schema: "learning",
                table: "PlatformCourseVideos",
                columns: new[] { "CourseId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformCourseVideos",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "PlatformCourses",
                schema: "learning");
        }
    }
}
