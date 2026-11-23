using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>A library video can be made private to one or more companies; without rows it stays public.</summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261130100000_AddCompanyVideos")]
    public partial class AddCompanyVideos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CompanyVideos",
                schema: "tenancy",
                columns: table => new
                {
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_CompanyVideos", x => new { x.VideoId, x.TenantId }));

            migrationBuilder.CreateIndex(
                name: "IX_CompanyVideos_TenantId",
                schema: "tenancy",
                table: "CompanyVideos",
                column: "TenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CompanyVideos", schema: "tenancy");
        }
    }
}
