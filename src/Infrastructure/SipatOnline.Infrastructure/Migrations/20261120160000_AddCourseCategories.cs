using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SipatOnline.Infrastructure.Migrations;

[DbContext(typeof(PlatformDbContext))]
[Migration("20261120160000_AddCourseCategories")]
public sealed class AddCourseCategories : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CourseCategories",
            schema: "learning",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                Position = table.Column<int>(type: "integer", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_CourseCategories", item => item.Id));
        migrationBuilder.CreateIndex(name: "IX_CourseCategories_Position", schema: "learning", table: "CourseCategories", column: "Position");
        migrationBuilder.AddColumn<Guid>(name: "CategoryId", schema: "learning", table: "PlatformCourses", type: "uuid", nullable: true);
        migrationBuilder.Sql("INSERT INTO learning.\"CourseCategories\" (\"Id\", \"Name\", \"Position\", \"CreatedAt\") VALUES ('7d1a0001-0000-4000-8000-000000000001', 'Alimentação', 0, now());");
        migrationBuilder.Sql("INSERT INTO learning.\"CourseCategories\" (\"Id\", \"Name\", \"Position\", \"CreatedAt\") VALUES ('7d1a0001-0000-4000-8000-000000000002', 'Segurança no trabalho', 1, now());");
        migrationBuilder.Sql("INSERT INTO learning.\"CourseCategories\" (\"Id\", \"Name\", \"Position\", \"CreatedAt\") VALUES ('7d1a0001-0000-4000-8000-000000000003', 'Postura', 2, now());");
        migrationBuilder.Sql("INSERT INTO learning.\"CourseCategories\" (\"Id\", \"Name\", \"Position\", \"CreatedAt\") VALUES ('7d1a0001-0000-4000-8000-000000000004', 'Saúde mental', 3, now());");
        migrationBuilder.Sql("UPDATE learning.\"PlatformCourses\" SET \"CategoryId\" = '7d1a0001-0000-4000-8000-000000000001' WHERE \"CategoryId\" IS NULL AND (\"Title\" ILIKE '%aliment%' OR \"Title\" ILIKE '%nutri%');");
        migrationBuilder.Sql("UPDATE learning.\"PlatformCourses\" SET \"CategoryId\" = '7d1a0001-0000-4000-8000-000000000003' WHERE \"CategoryId\" IS NULL AND (\"Title\" ILIKE '%postura%' OR \"Title\" ILIKE '%ergonomia%' OR \"Title\" ILIKE '%ginástica%');");
        migrationBuilder.Sql("UPDATE learning.\"PlatformCourses\" SET \"CategoryId\" = '7d1a0001-0000-4000-8000-000000000002' WHERE \"CategoryId\" IS NULL AND (\"Title\" ILIKE '%seguran%' OR \"Title\" ILIKE '%EPI%' OR \"Title\" ILIKE '%acidente%');");
        migrationBuilder.Sql("UPDATE learning.\"PlatformCourses\" SET \"CategoryId\" = '7d1a0001-0000-4000-8000-000000000004' WHERE \"CategoryId\" IS NULL AND (\"Title\" ILIKE '%mental%' OR \"Title\" ILIKE '%estresse%' OR \"Title\" ILIKE '%mente%');");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "CategoryId", schema: "learning", table: "PlatformCourses");
        migrationBuilder.DropTable(name: "CourseCategories", schema: "learning");
    }
}
