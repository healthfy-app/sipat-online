using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlaybackQualitySessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlaybackQualitySessions",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    DayPosition = table.Column<int>(type: "integer", nullable: true),
                    LessonId = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: true),
                    PlaybackSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TimezoneOffsetMinutes = table.Column<int>(type: "integer", nullable: false),
                    StartupMilliseconds = table.Column<long>(type: "bigint", nullable: true),
                    NeverStarted = table.Column<bool>(type: "boolean", nullable: false),
                    StallCount = table.Column<int>(type: "integer", nullable: false),
                    StallMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    WatchedMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    ErrorKind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Quality = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    QualitySwitches = table.Column<int>(type: "integer", nullable: false),
                    ConnectionType = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    DownlinkMbps = table.Column<double>(type: "double precision", nullable: true),
                    Device = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlaybackQualitySessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlaybackQualitySessions_StartedAt",
                schema: "learning",
                table: "PlaybackQualitySessions",
                column: "StartedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PlaybackQualitySessions_TenantId_SipatEventId",
                schema: "learning",
                table: "PlaybackQualitySessions",
                columns: new[] { "TenantId", "SipatEventId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlaybackQualitySessions",
                schema: "learning");
        }
    }
}
