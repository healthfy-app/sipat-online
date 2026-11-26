using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// The games in the middle of a video belong to one training: a company that edits them in its own training does
    /// not change the same video in anyone else's. Every training that had the video keeps the stops it showed until now;
    /// a stop of a video that is in no training goes away (it was never played).
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261205100000_CheckpointsPerTraining")]
    public partial class CheckpointsPerTraining : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "CourseId", schema: "learning", table: "PlatformVideoCheckpoints", type: "uuid", nullable: true);
            migrationBuilder.Sql("""
                INSERT INTO learning."PlatformVideoCheckpoints" ("Id", "CourseId", "VideoId", "ModuleId", "TimeMilliseconds")
                    SELECT gen_random_uuid(), link."CourseId", stop."VideoId", stop."ModuleId", stop."TimeMilliseconds"
                    FROM learning."PlatformVideoCheckpoints" AS stop
                    JOIN learning."PlatformCourseVideoLinks" AS link ON link."VideoId" = stop."VideoId"
                    WHERE stop."CourseId" IS NULL;
                DELETE FROM learning."PlatformVideoCheckpoints" WHERE "CourseId" IS NULL;
                """);
            migrationBuilder.AlterColumn<Guid>(name: "CourseId", schema: "learning", table: "PlatformVideoCheckpoints", type: "uuid", nullable: false,
                oldClrType: typeof(Guid), oldType: "uuid", oldNullable: true);
            migrationBuilder.CreateIndex(name: "IX_PlatformVideoCheckpoints_CourseId_VideoId", schema: "learning", table: "PlatformVideoCheckpoints",
                columns: new[] { "CourseId", "VideoId" });
            migrationBuilder.AddForeignKey(name: "FK_PlatformVideoCheckpoints_PlatformCourses_CourseId", schema: "learning", table: "PlatformVideoCheckpoints",
                column: "CourseId", principalSchema: "learning", principalTable: "PlatformCourses", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
