using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261113150000_AddSipatProgramsAndDays")]
public sealed class AddSipatProgramsAndDays : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "SipatPrograms",
            schema: "learning",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                DaysJson = table.Column<string>(type: "text", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_SipatPrograms", item => item.Id));

        migrationBuilder.AddColumn<string>(
            name: "DayTitle", schema: "learning", table: "LearningTracks",
            type: "character varying(120)", maxLength: 120, nullable: true);
        migrationBuilder.AddColumn<int>(
            name: "DayPosition", schema: "learning", table: "LearningTracks", type: "integer", nullable: true);
        migrationBuilder.AddColumn<int>(
            name: "CoursePosition", schema: "learning", table: "LearningTracks", type: "integer", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "CoursePosition", schema: "learning", table: "LearningTracks");
        migrationBuilder.DropColumn(name: "DayPosition", schema: "learning", table: "LearningTracks");
        migrationBuilder.DropColumn(name: "DayTitle", schema: "learning", table: "LearningTracks");
        migrationBuilder.DropTable(name: "SipatPrograms", schema: "learning");
    }
}
