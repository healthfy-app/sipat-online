using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SipatOnline.Infrastructure.Migrations
{
    /// <summary>
    /// Assunto became a classification of the library videos (like a genre). The fixed list the client uses is created
    /// as published assuntos, skipping a name that already exists (any case). Without videos an assunto stays out of the
    /// trainings until the operator classifies videos in it. "Vídeo interno" is not here: it is the assunto a company owns.
    /// </summary>
    [DbContext(typeof(PlatformDbContext))]
    [Migration("20261129100000_SeedVideoSubjects")]
    public partial class SeedVideoSubjects : Migration
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
            foreach (var title in Subjects)
            {
                var value = title.Replace("'", "''");
                migrationBuilder.Sql($"""
                    INSERT INTO learning."PlatformCourses" ("Id", "Title", "CreatedAt", "Status", "GamificationEnabled", "GameType")
                    SELECT gen_random_uuid(), '{value}', now(), 1, false, 0
                    WHERE NOT EXISTS (SELECT 1 FROM learning."PlatformCourses" WHERE lower("Title") = lower('{value}'));
                    """);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // the assuntos may already classify videos: they stay
        }
    }
}
