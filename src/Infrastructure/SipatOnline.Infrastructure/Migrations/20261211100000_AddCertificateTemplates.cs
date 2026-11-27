using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>The pictures a company puts on its certificates (cover, emblem, footer), and the template each company uses.</summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261211100000_AddCertificateTemplates")]
    public partial class AddCertificateTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "CertificateTemplateId", schema: "tenancy", table: "Tenants", type: "uuid", nullable: true);
            migrationBuilder.CreateTable(
                name: "CertificateTemplates",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoverData = table.Column<byte[]>(type: "bytea", nullable: true),
                    CoverContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EmblemData = table.Column<byte[]>(type: "bytea", nullable: true),
                    EmblemContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FooterData = table.Column<byte[]>(type: "bytea", nullable: true),
                    FooterContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_CertificateTemplates", x => x.Id));
            migrationBuilder.CreateIndex(name: "IX_CertificateTemplates_TenantId", schema: "learning", table: "CertificateTemplates", column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CertificateTemplates", schema: "learning");
            migrationBuilder.DropColumn(name: "CertificateTemplateId", schema: "tenancy", table: "Tenants");
        }
    }
}
