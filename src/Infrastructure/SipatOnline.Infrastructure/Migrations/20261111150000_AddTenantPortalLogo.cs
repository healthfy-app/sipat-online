using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261111150000_AddTenantPortalLogo")]
public sealed class AddTenantPortalLogo : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<byte[]>(name: "PortalLogoData", schema: "tenancy",
            table: "Tenants", type: "bytea", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "PortalLogoData", schema: "tenancy", table: "Tenants");
}
