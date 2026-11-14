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
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "CategoryId", schema: "learning", table: "PlatformCourses");
        migrationBuilder.DropTable(name: "CourseCategories", schema: "learning");
    }
}
