using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// The sectors that exist inside each unit. It starts from where the people already are: a unit gets every sector
    /// that someone of it is in.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261209100000_AddUnitSectors")]
    public partial class AddUnitSectors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CompanyUnitSectors",
                schema: "identity",
                columns: table => new
                {
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    SectorId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanyUnitSectors", x => new { x.UnitId, x.SectorId });
                    table.ForeignKey(name: "FK_CompanyUnitSectors_CompanyUnits_UnitId", column: x => x.UnitId,
                        principalSchema: "identity", principalTable: "CompanyUnits", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_CompanyUnitSectors_CompanySectors_SectorId", column: x => x.SectorId,
                        principalSchema: "identity", principalTable: "CompanySectors", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                });
            migrationBuilder.CreateIndex(name: "IX_CompanyUnitSectors_SectorId", schema: "identity", table: "CompanyUnitSectors", column: "SectorId");
            migrationBuilder.Sql("""
                INSERT INTO identity."CompanyUnitSectors" ("UnitId", "SectorId", "TenantId")
                SELECT DISTINCT "UnitId", "SectorId", "TenantId" FROM identity."Users"
                WHERE "UnitId" IS NOT NULL AND "SectorId" IS NOT NULL AND "TenantId" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CompanyUnitSectors", schema: "identity");
        }
    }
}
