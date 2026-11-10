using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseGameType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "GameType",
                schema: "learning",
                table: "PlatformCourses",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GameType",
                schema: "learning",
                table: "PlatformCourses");
        }
    }
}
