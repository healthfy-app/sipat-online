using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

/// <summary>Assuntos that belong to one company: its internal videos (plan Diamante).</summary>
[DbContext(typeof(PlatformDbContext))]
[Migration("20261126100000_AddCompanySubjects")]
public sealed class AddCompanySubjects : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CompanySubjects",
            schema: "tenancy",
            columns: table => new
            {
                CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                TenantId = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_CompanySubjects", item => item.CourseId));
        migrationBuilder.CreateIndex(name: "IX_CompanySubjects_TenantId", schema: "tenancy", table: "CompanySubjects", column: "TenantId");
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "CompanySubjects", schema: "tenancy");
}
