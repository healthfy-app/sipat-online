using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DisplayNameLocked",
                schema: "identity",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                schema: "identity",
                table: "Users",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegistrationNumber",
                schema: "identity",
                table: "Users",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SectorId",
                schema: "identity",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UnitId",
                schema: "identity",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CompanyProfileRules",
                schema: "identity",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequireRegistration = table.Column<bool>(type: "boolean", nullable: false),
                    RequireEmail = table.Column<bool>(type: "boolean", nullable: false),
                    RequirePhone = table.Column<bool>(type: "boolean", nullable: false),
                    RequireUnit = table.Column<bool>(type: "boolean", nullable: false),
                    RequireSector = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyProfileRules", x => x.TenantId);
                    table.ForeignKey(
                        name: "FK_CompanyProfileRules_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "tenancy",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CompanySectors",
                schema: "identity",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NameKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanySectors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompanySectors_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "tenancy",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CompanyUnits",
                schema: "identity",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NameKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompanyUnits_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "tenancy",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_SectorId",
                schema: "identity",
                table: "Users",
                column: "SectorId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_TenantId_SectorId",
                schema: "identity",
                table: "Users",
                columns: new[] { "TenantId", "SectorId" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_TenantId_UnitId",
                schema: "identity",
                table: "Users",
                columns: new[] { "TenantId", "UnitId" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_UnitId",
                schema: "identity",
                table: "Users",
                column: "UnitId");

            migrationBuilder.CreateIndex(
                name: "IX_CompanySectors_TenantId_NameKey",
                schema: "identity",
                table: "CompanySectors",
                columns: new[] { "TenantId", "NameKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CompanyUnits_TenantId_NameKey",
                schema: "identity",
                table: "CompanyUnits",
                columns: new[] { "TenantId", "NameKey" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_CompanySectors_SectorId",
                schema: "identity",
                table: "Users",
                column: "SectorId",
                principalSchema: "identity",
                principalTable: "CompanySectors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_CompanyUnits_UnitId",
                schema: "identity",
                table: "Users",
                column: "UnitId",
                principalSchema: "identity",
                principalTable: "CompanyUnits",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_CompanySectors_SectorId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_CompanyUnits_UnitId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropTable(
                name: "CompanyProfileRules",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "CompanySectors",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "CompanyUnits",
                schema: "identity");

            migrationBuilder.DropIndex(
                name: "IX_Users_SectorId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_TenantId_SectorId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_TenantId_UnitId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_UnitId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DisplayNameLocked",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Phone",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RegistrationNumber",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SectorId",
                schema: "identity",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "UnitId",
                schema: "identity",
                table: "Users");
        }
    }
}
