using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// A library video may have a 1080p version (new uploads whose original is taller than 720 lines).
    /// Every existing video starts without one: they keep their 720p and 480p.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261128100000_AddVideoFhd1080")]
    public partial class AddVideoFhd1080 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasFhd1080",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HasFhd1080",
                schema: "learning",
                table: "PlatformCourseVideos");
        }
    }
}
