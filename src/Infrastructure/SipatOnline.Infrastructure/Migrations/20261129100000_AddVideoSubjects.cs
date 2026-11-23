using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Assunto is a classification of the library videos (like a genre), kept apart from the trainings. The client's fixed
    /// list is created here. An earlier build of this branch stored them as empty trainings: those, untouched, are removed.
    /// "Vídeo interno" is not in the list: a video private to a company says so itself.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261129100000_AddVideoSubjects")]
    public partial class AddVideoSubjects : Migration
    {
        private static readonly string[] Subjects =
        [
            "Ergonomia e atividade física",
            "Alimentação para uma vida saudável",
            "Comportamento seguro",
            "Hábitos de vida",
            "Higiene mental",
            "Meio ambiente",
            "Assédio moral",
            "Assédio sexual",
            "Bem-estar e qualidade de vida: exercícios físicos em casa ou no escritório",
            "Bem-estar e qualidade de vida: exercícios físicos ao ar livre, em casa ou no escritório",
            "Bem-estar e qualidade de vida: qualidade do sono",
            "Bem-estar e qualidade de vida: cuidados com a balança, dietas e alimentação",
            "Bem-estar e qualidade de vida: exercícios e a relação com a dor",
            "Bem-estar e qualidade de vida: documentários e motivacionais",
            "Extras: temática para liderança",
            "TV Doutor",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VideoSubjects",
                schema: "learning",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_VideoSubjects", x => x.Id));

            migrationBuilder.CreateTable(
                name: "VideoSubjectLinks",
                schema: "learning",
                columns: table => new
                {
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    VideoId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_VideoSubjectLinks", x => new { x.SubjectId, x.VideoId }));

            migrationBuilder.CreateIndex(
                name: "IX_VideoSubjectLinks_VideoId",
                schema: "learning",
                table: "VideoSubjectLinks",
                column: "VideoId");

            foreach (var name in Subjects)
            {
                var value = name.Replace("'", "''");
                migrationBuilder.Sql($"""
                    INSERT INTO learning."VideoSubjects" ("Id", "Name") VALUES (gen_random_uuid(), '{value}');
                    DELETE FROM learning."PlatformCourses" c
                    WHERE c."Title" = '{value}'
                      AND NOT EXISTS (SELECT 1 FROM learning."PlatformCourseVideoLinks" l WHERE l."CourseId" = c."Id")
                      AND NOT EXISTS (SELECT 1 FROM learning."PlatformCourseLessons" s WHERE s."CourseId" = c."Id");
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "VideoSubjectLinks", schema: "learning");
            migrationBuilder.DropTable(name: "VideoSubjects", schema: "learning");
        }
    }
}
