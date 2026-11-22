using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>A Smartplayer video keeps its embed address (up to 240 characters), not a short id like YouTube or Vimeo.</summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261127100000_WidenExternalVideoId")]
    public partial class WidenExternalVideoId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(240)",
                maxLength: 240,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(240)",
                oldMaxLength: 240,
                oldNullable: true);
        }
    }
}
