using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>The week of a SIPAT opened in the video editor: one copy training per SIPAT, whose Títulos are its days.</summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261201100000_AddSipatWeekCourses")]
    public partial class AddSipatWeekCourses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SipatWeekCourses",
                schema: "learning",
                columns: table => new
                {
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CourseId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_SipatWeekCourses", x => x.SipatEventId));

            migrationBuilder.CreateIndex(
                name: "IX_SipatWeekCourses_CourseId",
                schema: "learning",
                table: "SipatWeekCourses",
                column: "CourseId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SipatWeekCourses_TenantId",
                schema: "learning",
                table: "SipatWeekCourses",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SipatWeekCourses", schema: "learning");
        }
    }
}
