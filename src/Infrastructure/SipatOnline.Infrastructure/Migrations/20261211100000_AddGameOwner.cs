using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// A game can belong to a company: the ones a company makes are its own, private to it. Every game that exists stays
    /// the operation's (no company), which every company can use.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261211100000_AddGameOwner")]
    public partial class AddGameOwner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TenantId",
                schema: "learning",
                table: "GameModules",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "TenantId", schema: "learning", table: "GameModules");
        }
    }
}
