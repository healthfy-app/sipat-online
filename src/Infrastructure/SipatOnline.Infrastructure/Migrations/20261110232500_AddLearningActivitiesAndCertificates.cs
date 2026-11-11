using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261110232500_AddLearningActivitiesAndCertificates")]
public sealed class AddLearningActivitiesAndCertificates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "ContentJson", schema: "learning", table: "GameModules", type: "text", nullable: true);
        migrationBuilder.AddColumn<Guid>(name: "SourceCourseId", schema: "learning", table: "LearningTracks", type: "uuid", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_LearningTracks_TenantId_SipatEventId_SourceCourseId", schema: "learning",
            table: "LearningTracks", columns: ["TenantId", "SipatEventId", "SourceCourseId"], unique: true);
        migrationBuilder.CreateTable(name: "LearningContentSnapshots", schema: "learning", columns: table => new {
            RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
            TenantId = table.Column<Guid>(type: "uuid", nullable: false),
            SourceCourseId = table.Column<Guid>(type: "uuid", nullable: false),
            ContentJson = table.Column<string>(type: "text", nullable: false),
            CoverData = table.Column<byte[]>(type: "bytea", nullable: true),
            CoverContentType = table.Column<string>(type: "text", nullable: true)
        }, constraints: table => {
            table.PrimaryKey("PK_LearningContentSnapshots", item => item.RevisionId);
            table.ForeignKey("FK_LearningContentSnapshots_LearningTrackRevisions_RevisionId", item => item.RevisionId,
                "LearningTrackRevisions", "Id", principalSchema: "learning", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateTable(name: "LearningActivityOutcomes", schema: "learning", columns: table => new {
            TenantId = table.Column<Guid>(type: "uuid", nullable: false),
            ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
            RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
            ActivityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
            Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
            RecordedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => {
            table.PrimaryKey("PK_LearningActivityOutcomes", item => new { item.TenantId, item.ParticipantId, item.RevisionId, item.ActivityId });
            table.ForeignKey("FK_LearningActivityOutcomes_LearningTrackRevisions_RevisionId", item => item.RevisionId,
                "LearningTrackRevisions", "Id", principalSchema: "learning", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateIndex(name: "IX_LearningActivityOutcomes_RevisionId", schema: "learning", table: "LearningActivityOutcomes", column: "RevisionId");
        migrationBuilder.CreateTable(name: "ParticipationCertificates", schema: "learning", columns: table => new {
            Id = table.Column<Guid>(type: "uuid", nullable: false),
            TenantId = table.Column<Guid>(type: "uuid", nullable: false),
            ParticipantId = table.Column<Guid>(type: "uuid", nullable: false),
            SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
            SnapshotJson = table.Column<string>(type: "text", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_ParticipationCertificates", item => item.Id));
        migrationBuilder.CreateIndex(name: "IX_ParticipationCertificates_TenantId_ParticipantId_SipatEventId", schema: "learning",
            table: "ParticipationCertificates", columns: ["TenantId", "ParticipantId", "SipatEventId"], unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "LearningActivityOutcomes", schema: "learning");
        migrationBuilder.DropTable(name: "LearningContentSnapshots", schema: "learning");
        migrationBuilder.DropTable(name: "ParticipationCertificates", schema: "learning");
        migrationBuilder.DropIndex(name: "IX_LearningTracks_TenantId_SipatEventId_SourceCourseId", table: "LearningTracks", schema: "learning");
        migrationBuilder.DropColumn(name: "SourceCourseId", table: "LearningTracks", schema: "learning");
        migrationBuilder.DropColumn(name: "ContentJson", table: "GameModules", schema: "learning");
    }
}
