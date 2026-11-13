using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261120100000_AddSipatPlans")]
public sealed class AddSipatPlans : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "SipatPlans",
            schema: "learning",
            columns: table => new
            {
                SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                DaysJson = table.Column<string>(type: "text", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_SipatPlans", item => item.SipatEventId));

        migrationBuilder.CreateIndex(
            name: "IX_SipatPlans_TenantId",
            schema: "learning",
            table: "SipatPlans",
            column: "TenantId");
    }

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "SipatPlans", schema: "learning");
}
