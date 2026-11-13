using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261120140000_AddPlanSubjectExclusions")]
public sealed class AddPlanSubjectExclusions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.CreateTable(
            name: "PlanSubjectExclusions",
            schema: "tenancy",
            columns: table => new
            {
                Plan = table.Column<int>(type: "integer", nullable: false),
                CourseId = table.Column<Guid>(type: "uuid", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_PlanSubjectExclusions", item => new { item.Plan, item.CourseId }));

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "PlanSubjectExclusions", schema: "tenancy");
}
