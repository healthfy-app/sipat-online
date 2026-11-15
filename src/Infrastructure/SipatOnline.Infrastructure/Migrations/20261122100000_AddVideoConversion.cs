using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVideoConversion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasSd480",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ProcessingError",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Ready");

            migrationBuilder.CreateTable(
                name: "VideoConversionJobs",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    Error = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VideoConversionJobs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VideoConversionJobs_Status_CreatedAt",
                schema: "learning",
                table: "VideoConversionJobs",
                columns: new[] { "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VideoConversionJobs",
                schema: "learning");

            migrationBuilder.DropColumn(
                name: "HasSd480",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "ProcessingError",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "learning",
                table: "PlatformCourseVideos");
        }
    }
}
