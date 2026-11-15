using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBonusLessons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningLessons_Duration",
                schema: "learning",
                table: "LearningLessons");

            migrationBuilder.AddColumn<bool>(
                name: "IsBonus",
                schema: "learning",
                table: "LearningLessons",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningLessons_Duration",
                schema: "learning",
                table: "LearningLessons",
                sql: "\"DurationMilliseconds\" > 0 OR (\"IsBonus\" AND \"DurationMilliseconds\" = 0)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningLessons_Duration",
                schema: "learning",
                table: "LearningLessons");

            migrationBuilder.DropColumn(
                name: "IsBonus",
                schema: "learning",
                table: "LearningLessons");

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningLessons_Duration",
                schema: "learning",
                table: "LearningLessons",
                sql: "\"DurationMilliseconds\" > 0");
        }
    }
}
