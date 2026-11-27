using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// A YouTube or Vimeo video with its length counts for progress and the certificate. Days delivered while it was
    /// still an extra start counting it too: the lesson keeps its row and place, only stops being an extra.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261203100000_CountExternalVideosWithLength")]
    public partial class CountExternalVideosWithLength : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE learning."LearningLessons" AS lesson SET "IsBonus" = FALSE
                FROM learning."PlatformCourseVideos" AS video
                WHERE lesson."IsBonus"
                  AND lesson."DurationMilliseconds" > 0
                  AND video."Provider" IN ('YouTube', 'Vimeo')
                  AND video."DurationMilliseconds" > 0
                  AND lesson."ProviderAssetReference" = LOWER(video."Provider") || ':' || video."ExternalId";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
