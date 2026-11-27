using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// A training can run past its last day: it gets a limit date, the last day it can be taken. Without one it ends
    /// with its last day, as before.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261212100000_AddTrainingLimit")]
    public partial class AddTrainingLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "EndsOn",
                schema: "learning",
                table: "PlatformCourses",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "EndsOn", schema: "learning", table: "PlatformCourses");
        }
    }
}
