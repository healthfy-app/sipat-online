using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// A company sends its own videos (the plan with internal videos): how much room it has, when the operation set
    /// another than the standard, and when it accepted the terms for sending. The video already had a column for its owner.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261206100000_AddCompanyOwnVideos")]
    public partial class AddCompanyOwnVideos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(name: "VideoQuotaBytes", schema: "tenancy", table: "Tenants", type: "bigint", nullable: true);
            migrationBuilder.AddColumn<DateTimeOffset>(name: "VideoTermsAcceptedAt", schema: "tenancy", table: "Tenants", type: "timestamp with time zone", nullable: true);
            migrationBuilder.CreateIndex(name: "IX_PlatformCourseVideos_OwnerTenantId", schema: "learning", table: "PlatformCourseVideos", column: "OwnerTenantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_PlatformCourseVideos_OwnerTenantId", schema: "learning", table: "PlatformCourseVideos");
            migrationBuilder.DropColumn(name: "VideoTermsAcceptedAt", schema: "tenancy", table: "Tenants");
            migrationBuilder.DropColumn(name: "VideoQuotaBytes", schema: "tenancy", table: "Tenants");
        }
    }
}
