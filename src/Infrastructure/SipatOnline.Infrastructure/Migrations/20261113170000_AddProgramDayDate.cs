using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261113170000_AddProgramDayDate")]
public sealed class AddProgramDayDate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<DateOnly>(
            name: "DayDate", schema: "learning", table: "LearningTracks", type: "date", nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "DayDate", schema: "learning", table: "LearningTracks");
}
