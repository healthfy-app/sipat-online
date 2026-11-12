using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112180000_AddTenantPortalBanner")]
public sealed class AddTenantPortalBanner : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<byte[]>(name: "PortalBannerData", schema: "tenancy",
            table: "Tenants", type: "bytea", nullable: true);
        migrationBuilder.AddColumn<string>(name: "PortalBannerContentType", schema: "tenancy",
            table: "Tenants", type: "character varying(32)", maxLength: 32, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "PortalBannerContentType", schema: "tenancy", table: "Tenants");
        migrationBuilder.DropColumn(name: "PortalBannerData", schema: "tenancy", table: "Tenants");
    }
}
