using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Games take assuntos from the same list as the videos, to be found by subject; and a puzzle's picture can be sent
    /// from the computer instead of only given as an address.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261210100000_AddGameSubjectsAndImages")]
    public partial class AddGameSubjectsAndImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameSubjectLinks",
                schema: "learning",
                columns: table => new
                {
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ModuleId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSubjectLinks", x => new { x.SubjectId, x.ModuleId });
                    table.ForeignKey(name: "FK_GameSubjectLinks_GameModules_ModuleId", column: x => x.ModuleId,
                        principalSchema: "learning", principalTable: "GameModules", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(name: "FK_GameSubjectLinks_VideoSubjects_SubjectId", column: x => x.SubjectId,
                        principalSchema: "learning", principalTable: "VideoSubjects", principalColumn: "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameSubjectLinks_ModuleId",
                schema: "learning",
                table: "GameSubjectLinks",
                column: "ModuleId");

            migrationBuilder.CreateTable(
                name: "GameImages",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Data = table.Column<byte[]>(type: "bytea", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_GameImages", x => x.Id));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "GameImages", schema: "learning");
            migrationBuilder.DropTable(name: "GameSubjectLinks", schema: "learning");
        }
    }
}
