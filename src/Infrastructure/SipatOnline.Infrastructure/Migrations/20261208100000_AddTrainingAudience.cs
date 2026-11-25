using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Who a training is for: the groups marked on it, each a unit (narrowed or not to a sector of it) or a sector in
    /// every unit. A training with no group is for the whole company, so the ones that already exist stay as they are.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261208100000_AddTrainingAudience")]
    public partial class AddTrainingAudience : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SipatEventTargets",
                schema: "sipats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SipatEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    SectorId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SipatEventTargets", x => x.Id);
                    table.CheckConstraint("CK_SipatEventTargets_Names", "\"UnitId\" IS NOT NULL OR \"SectorId\" IS NOT NULL");
                    table.ForeignKey(name: "FK_SipatEventTargets_SipatEvents_SipatEventId", column: x => x.SipatEventId,
                        principalSchema: "sipats", principalTable: "SipatEvents", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_SipatEventTargets_CompanyUnits_UnitId", column: x => x.UnitId,
                        principalSchema: "identity", principalTable: "CompanyUnits", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(name: "FK_SipatEventTargets_CompanySectors_SectorId", column: x => x.SectorId,
                        principalSchema: "identity", principalTable: "CompanySectors", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
                });
            migrationBuilder.CreateIndex(name: "IX_SipatEventTargets_SipatEventId", schema: "sipats", table: "SipatEventTargets", column: "SipatEventId");
            migrationBuilder.CreateIndex(name: "IX_SipatEventTargets_UnitId", schema: "sipats", table: "SipatEventTargets", column: "UnitId");
            migrationBuilder.CreateIndex(name: "IX_SipatEventTargets_SectorId", schema: "sipats", table: "SipatEventTargets", column: "SectorId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SipatEventTargets", schema: "sipats");
        }
    }
}
