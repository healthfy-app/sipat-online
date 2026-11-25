using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>A picture chosen for a video, shown on its card instead of a frame of the video itself.</summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261207100000_AddVideoThumbnails")]
    public partial class AddVideoThumbnails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "ThumbnailContentType", schema: "learning", table: "PlatformCourseVideos", type: "character varying(50)", maxLength: 50, nullable: true);
            migrationBuilder.AddColumn<DateTimeOffset>(name: "ThumbnailUpdatedAt", schema: "learning", table: "PlatformCourseVideos", type: "timestamp with time zone", nullable: true);
            migrationBuilder.CreateTable(
                name: "PlatformVideoThumbnails",
                schema: "learning",
                columns: table => new
                {
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformVideoThumbnails", x => x.VideoId);
                    table.ForeignKey(name: "FK_PlatformVideoThumbnails_PlatformCourseVideos_VideoId", column: x => x.VideoId,
                        principalSchema: "learning", principalTable: "PlatformCourseVideos", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "PlatformVideoThumbnails", schema: "learning");
            migrationBuilder.DropColumn(name: "ThumbnailUpdatedAt", schema: "learning", table: "PlatformCourseVideos");
            migrationBuilder.DropColumn(name: "ThumbnailContentType", schema: "learning", table: "PlatformCourseVideos");
        }
    }
}
