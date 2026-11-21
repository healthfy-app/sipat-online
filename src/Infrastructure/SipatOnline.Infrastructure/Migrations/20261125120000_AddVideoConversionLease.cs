using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVideoConversionLease : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LeaseUntil",
                schema: "learning",
                table: "VideoConversionJobs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LeasedBy",
                schema: "learning",
                table: "VideoConversionJobs",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_VideoConversionJobs_Status_LeaseUntil",
                schema: "learning",
                table: "VideoConversionJobs",
                columns: new[] { "Status", "LeaseUntil" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_VideoConversionJobs_Status_LeaseUntil",
                schema: "learning",
                table: "VideoConversionJobs");

            migrationBuilder.DropColumn(
                name: "LeaseUntil",
                schema: "learning",
                table: "VideoConversionJobs");

            migrationBuilder.DropColumn(
                name: "LeasedBy",
                schema: "learning",
                table: "VideoConversionJobs");
        }
    }
}
