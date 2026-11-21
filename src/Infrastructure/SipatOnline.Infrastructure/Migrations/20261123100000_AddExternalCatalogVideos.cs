using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalCatalogVideos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OwnerTenantId",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                schema: "learning",
                table: "PlatformCourseVideos",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Sipat");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformCourseVideos_Provider_ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos",
                columns: new[] { "Provider", "ExternalId" },
                unique: true,
                filter: "\"ExternalId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PlatformCourseVideos_Provider_ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "ExternalId",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "OwnerTenantId",
                schema: "learning",
                table: "PlatformCourseVideos");

            migrationBuilder.DropColumn(
                name: "Provider",
                schema: "learning",
                table: "PlatformCourseVideos");
        }
    }
}
