using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLearningModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "learning");

            migrationBuilder.CreateTable(
                name: "LearningTracks",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CurrentRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningTracks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearningTracks_SipatEvents_SipatEventId",
                        column: x => x.SipatEventId,
                        principalSchema: "sipats",
                        principalTable: "SipatEvents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LearningTracks_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "tenancy",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningAssignments",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningAssignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearningAssignments_LearningTracks_TrackId",
                        column: x => x.TrackId,
                        principalSchema: "learning",
                        principalTable: "LearningTracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningTrackRevisions",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionNumber = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningTrackRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LearningTrackRevisions_LearningTracks_TrackId",
                        column: x => x.TrackId,
                        principalSchema: "learning",
                        principalTable: "LearningTracks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningLessons",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ProviderAssetReference = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    DurationMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningLessons", x => x.Id);
                    table.CheckConstraint("CK_LearningLessons_Duration", "\"DurationMilliseconds\" > 0");
                    table.CheckConstraint("CK_LearningLessons_Position", "\"Position\" > 0");
                    table.ForeignKey(
                        name: "FK_LearningLessons_LearningTrackRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalSchema: "learning",
                        principalTable: "LearningTrackRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LearningProgress",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TrackId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LessonId = table.Column<Guid>(type: "uuid", nullable: false),
                    DurationMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    CompletionThresholdPercent = table.Column<int>(type: "integer", nullable: false),
                    LastPlaybackPositionMilliseconds = table.Column<long>(type: "bigint", nullable: false),
                    WatchedRangesJson = table.Column<string>(type: "text", nullable: false),
                    FirstStartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastAccessedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LearningProgress", x => x.Id);
                    table.CheckConstraint("CK_LearningProgress_Duration", "\"DurationMilliseconds\" > 0");
                    table.CheckConstraint("CK_LearningProgress_Position", "\"LastPlaybackPositionMilliseconds\" BETWEEN 0 AND \"DurationMilliseconds\"");
                    table.CheckConstraint("CK_LearningProgress_Threshold", "\"CompletionThresholdPercent\" BETWEEN 1 AND 100");
                    table.ForeignKey(
                        name: "FK_LearningProgress_LearningLessons_LessonId",
                        column: x => x.LessonId,
                        principalSchema: "learning",
                        principalTable: "LearningLessons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LearningAssignments_TenantId_ParticipantId_RevokedAt",
                schema: "learning",
                table: "LearningAssignments",
                columns: new[] { "TenantId", "ParticipantId", "RevokedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningAssignments_TenantId_ParticipantId_TrackId",
                schema: "learning",
                table: "LearningAssignments",
                columns: new[] { "TenantId", "ParticipantId", "TrackId" },
                unique: true,
                filter: "\"RevokedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LearningAssignments_TrackId",
                schema: "learning",
                table: "LearningAssignments",
                column: "TrackId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningLessons_RevisionId",
                schema: "learning",
                table: "LearningLessons",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningLessons_TenantId_RevisionId_Position",
                schema: "learning",
                table: "LearningLessons",
                columns: new[] { "TenantId", "RevisionId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearningProgress_LessonId",
                schema: "learning",
                table: "LearningProgress",
                column: "LessonId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningProgress_TenantId_ParticipantId_LessonId",
                schema: "learning",
                table: "LearningProgress",
                columns: new[] { "TenantId", "ParticipantId", "LessonId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearningTrackRevisions_TenantId_TrackId_RevisionNumber",
                schema: "learning",
                table: "LearningTrackRevisions",
                columns: new[] { "TenantId", "TrackId", "RevisionNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LearningTrackRevisions_TenantId_TrackId_Status",
                schema: "learning",
                table: "LearningTrackRevisions",
                columns: new[] { "TenantId", "TrackId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_LearningTrackRevisions_TrackId",
                schema: "learning",
                table: "LearningTrackRevisions",
                column: "TrackId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningTracks_SipatEventId",
                schema: "learning",
                table: "LearningTracks",
                column: "SipatEventId");

            migrationBuilder.CreateIndex(
                name: "IX_LearningTracks_TenantId_SipatEventId_Title",
                schema: "learning",
                table: "LearningTracks",
                columns: new[] { "TenantId", "SipatEventId", "Title" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LearningAssignments",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "LearningProgress",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "LearningLessons",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "LearningTrackRevisions",
                schema: "learning");

            migrationBuilder.DropTable(
                name: "LearningTracks",
                schema: "learning");
        }
    }
}
