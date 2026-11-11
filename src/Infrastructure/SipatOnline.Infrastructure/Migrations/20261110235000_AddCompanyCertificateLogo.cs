using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261110235000_AddCompanyCertificateLogo")]
public sealed class AddCompanyCertificateLogo : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<byte[]>(name: "CertificateLogoData", schema: "tenancy", table: "Tenants", type: "bytea", nullable: true);
        migrationBuilder.AddColumn<string>(name: "CertificateLogoContentType", schema: "tenancy", table: "Tenants", type: "text", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "CertificateLogoData", schema: "tenancy", table: "Tenants");
        migrationBuilder.DropColumn(name: "CertificateLogoContentType", schema: "tenancy", table: "Tenants");
    }
}
