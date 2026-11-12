using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformOperators : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_Users_Tenant_LoginIdentifier",
                schema: "identity",
                table: "Users");

            migrationBuilder.AlterColumn<Guid>(
                name: "TenantId",
                schema: "identity",
                table: "Users",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateIndex(
                name: "UX_PlatformOperators_LoginIdentifier",
                schema: "identity",
                table: "Users",
                column: "NormalizedEmployeeIdentifier",
                unique: true,
                filter: "\"TenantId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "UX_Users_Tenant_LoginIdentifier",
                schema: "identity",
                table: "Users",
                columns: new[] { "TenantId", "NormalizedEmployeeIdentifier" },
                unique: true,
                filter: "\"TenantId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_PlatformOperators_LoginIdentifier",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "UX_Users_Tenant_LoginIdentifier",
                schema: "identity",
                table: "Users");

            migrationBuilder.AlterColumn<Guid>(
                name: "TenantId",
                schema: "identity",
                table: "Users",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_Users_Tenant_LoginIdentifier",
                schema: "identity",
                table: "Users",
                columns: new[] { "TenantId", "NormalizedEmployeeIdentifier" },
                unique: true);
        }
    }
}
