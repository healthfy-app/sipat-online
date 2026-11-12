using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCourseCover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CoverContentType",
                schema: "learning",
                table: "PlatformCourses",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CoverUpdatedAt",
                schema: "learning",
                table: "PlatformCourses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PlatformCourseCovers",
                schema: "learning",
                columns: table => new
                {
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformCourseCovers", x => x.CourseId);
                    table.ForeignKey(
                        name: "FK_PlatformCourseCovers_PlatformCourses_CourseId",
                        column: x => x.CourseId,
                        principalSchema: "learning",
                        principalTable: "PlatformCourses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformCourseCovers",
                schema: "learning");

            migrationBuilder.DropColumn(
                name: "CoverContentType",
                schema: "learning",
                table: "PlatformCourses");

            migrationBuilder.DropColumn(
                name: "CoverUpdatedAt",
                schema: "learning",
                table: "PlatformCourses");
        }
    }
}
