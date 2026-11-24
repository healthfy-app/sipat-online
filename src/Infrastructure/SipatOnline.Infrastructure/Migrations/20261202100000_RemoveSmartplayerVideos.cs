using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Smartplayer is no longer offered: its videos leave the library, the trainings (the others keep their order),
    /// the assuntos and the companies' lists.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261202100000_RemoveSmartplayerVideos")]
    public partial class RemoveSmartplayerVideos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TEMP TABLE smartplayer_videos ON COMMIT DROP AS
                    SELECT "Id" FROM learning."PlatformCourseVideos" WHERE "Provider" = 'Smartplayer';
                DELETE FROM learning."VideoSubjectLinks" WHERE "VideoId" IN (SELECT "Id" FROM smartplayer_videos);
                DELETE FROM learning."PlatformCourseVideoLinks" WHERE "VideoId" IN (SELECT "Id" FROM smartplayer_videos);
                DELETE FROM learning."PlatformVideoCheckpoints" WHERE "VideoId" IN (SELECT "Id" FROM smartplayer_videos);
                DELETE FROM tenancy."CompanyVideos" WHERE "VideoId" IN (SELECT "Id" FROM smartplayer_videos);
                DELETE FROM learning."PlatformCourseVideos" WHERE "Id" IN (SELECT "Id" FROM smartplayer_videos);
                UPDATE learning."PlatformCourseVideoLinks" AS link SET "Position" = ordered.position
                FROM (SELECT "CourseId", "VideoId", ROW_NUMBER() OVER (PARTITION BY "CourseId" ORDER BY "Position") - 1 AS position
                      FROM learning."PlatformCourseVideoLinks") AS ordered
                WHERE link."CourseId" = ordered."CourseId" AND link."VideoId" = ordered."VideoId" AND link."Position" <> ordered.position;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
