using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Who a training is for: the units and the sectors marked on it. A training with nothing marked is for the whole
    /// company, so the ones that already exist stay as they are.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261208100000_AddTrainingAudience")]
    public partial class AddTrainingAudience : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SipatEventUnits",
                schema: "sipats",
                columns: table => new
                {
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SipatEventUnits", x => new { x.SipatEventId, x.UnitId });
                    table.ForeignKey(name: "FK_SipatEventUnits_SipatEvents_SipatEventId", column: x => x.SipatEventId,
                        principalSchema: "sipats", principalTable: "SipatEvents", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_SipatEventUnits_CompanyUnits_UnitId", column: x => x.UnitId,
                        principalSchema: "identity", principalTable: "CompanyUnits", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateTable(
                name: "SipatEventSectors",
                schema: "sipats",
                columns: table => new
                {
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    SectorId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SipatEventSectors", x => new { x.SipatEventId, x.SectorId });
                    table.ForeignKey(name: "FK_SipatEventSectors_SipatEvents_SipatEventId", column: x => x.SipatEventId,
                        principalSchema: "sipats", principalTable: "SipatEvents", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_SipatEventSectors_CompanySectors_SectorId", column: x => x.SectorId,
                        principalSchema: "identity", principalTable: "CompanySectors", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateIndex(name: "IX_SipatEventUnits_UnitId", schema: "sipats", table: "SipatEventUnits", column: "UnitId");
            migrationBuilder.CreateIndex(name: "IX_SipatEventSectors_SectorId", schema: "sipats", table: "SipatEventSectors", column: "SectorId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SipatEventSectors", schema: "sipats");
            migrationBuilder.DropTable(name: "SipatEventUnits", schema: "sipats");
        }
    }
}
