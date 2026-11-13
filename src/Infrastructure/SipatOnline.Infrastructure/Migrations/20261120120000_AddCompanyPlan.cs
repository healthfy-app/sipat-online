using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261120120000_AddCompanyPlan")]
public sealed class AddCompanyPlan : Migration
{
    // companies that already exist keep every feature (3 = Diamante)
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<int>(name: "Plan", schema: "tenancy", table: "Tenants", type: "integer", nullable: false, defaultValue: 3);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "Plan", schema: "tenancy", table: "Tenants");
}
