using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Where each certificate's PDF is kept (R2, in the tree company / unit / sector / person / date), and copies of the
    /// issue date, title and demonstration mark of the snapshot, so the company's list of certificates reads small columns.
    /// The certificates issued before are filled from their snapshots; the archive saves their PDFs afterwards.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261213100000_ArchiveCertificates")]
    public partial class ArchiveCertificates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(name: "IssuedAt", schema: "learning", table: "ParticipationCertificates",
                type: "timestamp with time zone", nullable: false, defaultValue: new DateTimeOffset(1, 1, 1, 0, 0, 0, TimeSpan.Zero));
            migrationBuilder.AddColumn<string>(name: "EventTitle", schema: "learning", table: "ParticipationCertificates",
                type: "character varying(200)", maxLength: 200, nullable: false, defaultValue: "");
            migrationBuilder.AddColumn<bool>(name: "IsDemonstration", schema: "learning", table: "ParticipationCertificates",
                type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<string>(name: "ArchiveKey", schema: "learning", table: "ParticipationCertificates",
                type: "character varying(1024)", maxLength: 1024, nullable: true);
            migrationBuilder.Sql("""
                UPDATE learning."ParticipationCertificates" SET
                    "IssuedAt" = COALESCE(("SnapshotJson"::jsonb ->> 'issuedAt')::timestamptz, "IssuedAt"),
                    "EventTitle" = LEFT(COALESCE("SnapshotJson"::jsonb ->> 'eventTitle', ''), 200),
                    "IsDemonstration" = COALESCE(("SnapshotJson"::jsonb ->> 'isDemonstration')::boolean, FALSE);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ArchiveKey", schema: "learning", table: "ParticipationCertificates");
            migrationBuilder.DropColumn(name: "IsDemonstration", schema: "learning", table: "ParticipationCertificates");
            migrationBuilder.DropColumn(name: "EventTitle", schema: "learning", table: "ParticipationCertificates");
            migrationBuilder.DropColumn(name: "IssuedAt", schema: "learning", table: "ParticipationCertificates");
        }
    }
}
