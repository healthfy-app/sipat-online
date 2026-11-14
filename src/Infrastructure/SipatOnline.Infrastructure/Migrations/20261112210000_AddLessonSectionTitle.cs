using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261112210000_AddLessonSectionTitle")]
public sealed class AddLessonSectionTitle : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "SectionTitle", schema: "learning", table: "LearningLessons",
            type: "character varying(200)", maxLength: 200, nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(name: "SectionTitle", schema: "learning", table: "LearningLessons");
}
