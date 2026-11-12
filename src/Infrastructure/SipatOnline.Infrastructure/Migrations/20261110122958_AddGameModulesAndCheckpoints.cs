using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGameModulesAndCheckpoints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameModules",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    GameType = table.Column<int>(type: "integer", nullable: false),
                    QuestionsJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameModules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformCourseModuleLinks",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ModuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    AfterVideoCount = table.Column<int>(type: "integer", nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformCourseModuleLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformCourseModuleLinks_GameModules_ModuleId",
                        column: x => x.ModuleId,
                        principalSchema: "learning",
                        principalTable: "GameModules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlatformCourseModuleLinks_PlatformCourses_CourseId",
                        column: x => x.CourseId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlatformVideoCheckpoints",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    ModuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    TimeMilliseconds = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformVideoCheckpoints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformVideoCheckpoints_GameModules_ModuleId",
                        column: x => x.ModuleId,
                        principalSchema: "learning",
                        principalTable: "GameModules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlatformVideoCheckpoints_PlatformCourseVideos_VideoId",
                        column: x => x.VideoId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourseVideos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseModuleLinks_CourseId_Order",
                schema: "learning",
                table: "PlatformCourseModuleLinks",
                columns: new[] { "CourseId", "Order" });

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseModuleLinks_ModuleId",
                schema: "learning",
                table: "PlatformCourseModuleLinks",
                column: "ModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformVideoCheckpoints_ModuleId",
                schema: "learning",
                table: "PlatformVideoCheckpoints",
                column: "ModuleId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformVideoCheckpoints_VideoId_TimeMilliseconds",
                schema: "learning",
                table: "PlatformVideoCheckpoints",
                columns: new[] { "VideoId", "TimeMilliseconds" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformCourseModuleLinks",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "PlatformVideoCheckpoints",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "GameModules",
                schema: "learning");
        }
    }
}
