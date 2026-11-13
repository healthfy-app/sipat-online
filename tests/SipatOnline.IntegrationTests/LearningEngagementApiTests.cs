using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class LearningEngagementApiTests
{
    private static readonly byte[] Logo = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");

    [DockerFact]
    public async Task PublishedCourse_PlaysWithImmutableActivitiesAndIssuesBrandedCertificateFromVerifiedCoverage()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), developmentSampleEnabled: true);
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.False(db.Database.HasPendingModelChanges());
        var sipatId = await db.SipatEvents.Select(item => item.Id).SingleAsync();
        await db.LearningAssignments.ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
        var videoId = Guid.NewGuid();
        byte[] videoBytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];
        var storage = scope.ServiceProvider.GetRequiredService<IPlatformCourseVideoStorage>();
        await using var videoStream = new MemoryStream(videoBytes);
        Assert.True((await storage.SaveAsync(videoId, videoStream, "video/mp4", videoBytes.Length, CancellationToken.None)).IsSuccess);
        try
        {
            db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
            {
                Id = videoId,
                Title = "Vídeo da integração",
                ContentType = "video/mp4",
                SizeBytes = videoBytes.Length,
                DurationMilliseconds = 1000,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
            using var platform = Client(factory, "ops.localhost");
            using var participant = Client(factory);
            using var admin = Client(factory);
            await Call(platform, "/api/platform/identity/login", HttpMethod.Post,
                new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
            await Call(participant, "/api/identity/login", HttpMethod.Post,
                new LoginRequest("participant-demo", "ParticipantPassword123"), HttpStatusCode.NoContent);
            await Call(admin, "/api/identity/login", HttpMethod.Post,
                new LoginRequest("admin-root", "AdminPassword123"), HttpStatusCode.NoContent);
            var companyPath = $"/api/platform/companies/{SipatOnlineApiFactory.DefaultTenantId:D}/learning";
            var course = await Call(platform, "/api/platform/catalog/courses", HttpMethod.Post,
                new { title = "Curso integrado", description = "Curso do teste", gamificationEnabled = true }, HttpStatusCode.Created);
            var courseId = course.GetProperty("id").GetGuid();
            await Call(platform, $"/api/platform/catalog/courses/{courseId}/videos", HttpMethod.Put,
                new { videoIds = new[] { videoId } });
            var moduleIds = new List<Guid>();
            foreach (var type in new[] { "Quiz", "Scenario", "Ordering", "Memory", "Puzzle", "RiskSpotting", "SafeOrRisky" })
            {
                var module = await Call(platform, "/api/platform/catalog/modules", HttpMethod.Post, new
                {
                    title = $"Atividade {type}",
                    gameType = type,
                    questions = new[] { new { text = "Qual a resposta?", options = new[] { "Segura", "Insegura" }, correctIndex = 0 } },
                    content = new
                    {
                        imageUrl = "/risk-scene.svg",
                        columns = 2,
                        items = new[] { "Planejar", "Executar" },
                        pairs = new[] { new { first = "EPI", second = "Proteção" }, new { first = "Piso", second = "Sinalização" } },
                        risks = new[] { new { label = "Cabo", x = 10, y = 10, width = 20, height = 20 } },
                        cards = new[]
                        {
                            new { text = "Usar o cinto em altura", safe = true, explanation = (string?)"Evita quedas." },
                            new { text = "Correr na escada", safe = false, explanation = (string?)null },
                            new { text = "Sinalizar o piso molhado", safe = true, explanation = (string?)"Previne escorregões." }
                        }
                    }
                }, HttpStatusCode.Created);
                Assert.Equal(type, module.GetProperty("gameType").GetString());
                moduleIds.Add(module.GetProperty("id").GetGuid());
            }
            await Call(platform, "/api/platform/catalog/modules", HttpMethod.Post, new
            {
                title = "Risco inválido",
                gameType = "RiskSpotting",
                questions = Array.Empty<object>(),
                content = new
                {
                    imageUrl = "/risk-scene.svg",
                    columns = 2,
                    risks = new[] { new { label = "Fora da imagem", x = 90, y = 10, width = 20, height = 20 } }
                }
            }, HttpStatusCode.BadRequest);
            await Call(platform, "/api/platform/catalog/modules", HttpMethod.Post, new
            {
                title = "Poucas cartas",
                gameType = "SafeOrRisky",
                questions = Array.Empty<object>(),
                content = new { columns = 2, cards = new[] { new { text = "Só uma", safe = true } } }
            }, HttpStatusCode.BadRequest);
            await Call(platform, $"/api/platform/catalog/courses/{courseId}/modules", HttpMethod.Put,
                new { items = moduleIds.Select(id => new { moduleId = id, afterVideoCount = 0 }) });
            await Call(platform, $"/api/platform/catalog/videos/{videoId}/checkpoints", HttpMethod.Put,
                new { items = new[] { new { moduleId = moduleIds[0], timeMilliseconds = 500 } } });
            await Call(platform, $"/api/platform/catalog/courses/{courseId}", HttpMethod.Put,
                new { title = "Curso integrado", description = "Curso do teste", status = "Published", gamificationEnabled = true });
            var association = await Call(platform, $"{companyPath}/sipats/{sipatId}/courses/{courseId}", HttpMethod.Post, new { });
            var trackId = association.GetProperty("trackId").GetGuid();
            var repeated = await Call(platform, $"{companyPath}/sipats/{sipatId}/courses/{courseId}", HttpMethod.Post, new { });
            Assert.Equal(trackId, repeated.GetProperty("trackId").GetGuid());
            var activities = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}/activities");
            Assert.Equal(8, activities.GetProperty("items").GetArrayLength());
            Assert.Equal(moduleIds, activities.GetProperty("items").EnumerateArray().Take(7).Select(item => item.GetProperty("module").GetProperty("id").GetGuid()));
            await Call(participant, $"/api/learning/tracks/{trackId}/activities/placement-0/outcome", HttpMethod.Put, new { outcome = "completed" });
            await Call(participant, $"/api/learning/tracks/{trackId}/activities/placement-0/outcome", HttpMethod.Put, new { outcome = "skipped" });
            await Call(participant, $"/api/learning/tracks/{trackId}/activities/placement-0/outcome", HttpMethod.Put,
                new { outcome = "forged" }, HttpStatusCode.BadRequest);
            await Call(participant, $"/api/learning/tracks/{trackId}/activities/not-an-activity/outcome", HttpMethod.Put,
                new { outcome = "completed" }, HttpStatusCode.BadRequest);
            activities = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}/activities");
            Assert.Equal("completed", activities.GetProperty("items")[0].GetProperty("outcome").GetString());
            await Call(platform, $"/api/platform/catalog/modules/{moduleIds[0]}", HttpMethod.Put, new
            {
                title = "Alterado no catálogo",
                gameType = "Quiz",
                questions = new[] { new { text = "Nova questão", options = new[] { "A", "B" }, correctIndex = 1 } }
            });
            activities = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}/activities");
            Assert.Equal("Atividade Quiz", activities.GetProperty("items")[0].GetProperty("module").GetProperty("title").GetString());

            var logoPath = $"{companyPath}/certificate-logo";
            using (var denied = await participant.GetAsync(logoPath)) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            using (var invalid = await UploadLogo(platform, logoPath, Encoding.UTF8.GetBytes("<svg/>"))) Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
            using (var oversized = await UploadLogo(platform, logoPath, new byte[256 * 1024 + 1])) Assert.Equal(HttpStatusCode.RequestEntityTooLarge, oversized.StatusCode);
            await Call(participant, $"/api/learning/sipats/{sipatId}/certificate", HttpMethod.Post, new { }, HttpStatusCode.Conflict);
            using (var uploaded = await UploadLogo(platform, logoPath, Logo)) Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
            using (var logoResponse = await platform.GetAsync($"{logoPath}/image")) Assert.Equal(Logo, await logoResponse.Content.ReadAsByteArrayAsync());
            await Call(participant, $"/api/learning/sipats/{sipatId}/certificate", HttpMethod.Post, new { }, HttpStatusCode.Conflict);
            var experience = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}");
            var lessonId = experience.GetProperty("lessons")[0].GetProperty("id").GetGuid();
            using (var rangeRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/learning/lessons/{lessonId}/media"))
            {
                rangeRequest.Headers.Range = new RangeHeaderValue(0, 7);
                using var media = await participant.SendAsync(rangeRequest);
                Assert.Equal(HttpStatusCode.PartialContent, media.StatusCode);
                Assert.Equal("video/mp4", media.Content.Headers.ContentType?.MediaType);
                Assert.Equal(videoBytes[..8], await media.Content.ReadAsByteArrayAsync());
            }
            using (var forbiddenMedia = await admin.GetAsync($"/api/learning/lessons/{lessonId}/media")) Assert.Equal(HttpStatusCode.Forbidden, forbiddenMedia.StatusCode);
            var playback = await Call(participant, $"/api/learning/tracks/{trackId}/lessons/{lessonId}/playback", HttpMethod.Post, new { });
            var sessionId = playback.GetProperty("sessionId").GetGuid();
            await Call(participant, $"/api/learning/tracks/{trackId}/lessons/{lessonId}/ranges", HttpMethod.Post,
                new { sessionId, startMilliseconds = 0, endMilliseconds = 899, positionMilliseconds = 899 });
            await Call(participant, $"/api/learning/sipats/{sipatId}/certificate", HttpMethod.Post, new { }, HttpStatusCode.Conflict);
            var completed = await Call(participant, $"/api/learning/tracks/{trackId}/lessons/{lessonId}/ranges", HttpMethod.Post,
                new { sessionId, startMilliseconds = 899, endMilliseconds = 900, positionMilliseconds = 900 });
            Assert.True(completed.GetProperty("isCompleted").GetBoolean());
            await db.Tenants.Where(item => item.Id == SipatOnlineApiFactory.DefaultTenantId)
                .ExecuteUpdateAsync(update => update.SetProperty(item => item.CertificateLogoData, (byte[]?)null)
                    .SetProperty(item => item.CertificateLogoContentType, (string?)null));
            var missingLogo = await Call(participant, $"/api/learning/sipats/{sipatId}/certificate",
                HttpMethod.Post, new { }, HttpStatusCode.Conflict);
            Assert.Equal("learning.certificate_logo_pending", missingLogo.GetProperty("code").GetString());
            using (var restored = await UploadLogo(platform, logoPath, Logo)) Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
            var issues = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ =>
                Call(participant, $"/api/learning/sipats/{sipatId}/certificate", HttpMethod.Post, new { })));
            var certificateId = issues[0].GetProperty("id").GetGuid();
            Assert.All(issues, item => Assert.Equal(certificateId, item.GetProperty("id").GetGuid()));
            Assert.Equal("Integration Test", issues[0].GetProperty("companyName").GetString());
            Assert.False(issues[0].TryGetProperty("companyLogo", out _));
            using var pdfResponse = await participant.GetAsync($"/api/learning/certificates/{certificateId}/pdf");
            Assert.Equal(HttpStatusCode.OK, pdfResponse.StatusCode);
            Assert.Equal("application/pdf", pdfResponse.Content.Headers.ContentType?.MediaType);
            var pdfBytes = await pdfResponse.Content.ReadAsByteArrayAsync();
            Assert.Equal("%PDF-", Encoding.ASCII.GetString(pdfBytes, 0, 5));
            using var pdfStream = new MemoryStream(pdfBytes);
            using var pdf = PdfReader.Open(pdfStream, PdfDocumentOpenMode.Import);
            Assert.Single(pdf.Pages);
            Assert.Contains(pdf.Internals.GetAllObjects().OfType<PdfDictionary>(),
                item => item.Elements.GetName("/Subtype") == "/Image" && item.Elements.GetInteger("/Width") == 1);
            using (var accessible = await admin.GetAsync($"/api/learning/certificates/{certificateId}/pdf")) Assert.Equal(HttpStatusCode.OK, accessible.StatusCode);
            using (var missing = await participant.GetAsync($"/api/learning/certificates/{Guid.NewGuid()}/pdf")) Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
            var users = scope.ServiceProvider.GetRequiredService<UserManager<PlatformIdentityUser>>();
            await CreateParticipant(users, SipatOnlineApiFactory.DefaultTenantId, "another-participant");
            using var another = Client(factory);
            await Call(another, "/api/identity/login", HttpMethod.Post,
                new LoginRequest("another-participant", "ParticipantPassword123"), HttpStatusCode.NoContent);
            using (var denied = await another.GetAsync($"/api/learning/certificates/{certificateId}/pdf")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            using (var denied = await another.GetAsync($"/api/learning/lessons/{lessonId}/media")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            using (var denied = await another.GetAsync($"/api/learning/tracks/{trackId}/activities")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            var otherTenantId = Guid.NewGuid();
            db.Tenants.Add(new TenantEntity
            {
                Id = otherTenantId,
                Key = "another-company",
                Name = "Another Company",
                PrimaryColor = "#123456",
                SecondaryColor = "#654321",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
            await CreateParticipant(users, otherTenantId, "another-tenant-participant");
            using var otherTenant = Client(factory, "another-company.localhost");
            await Call(otherTenant, "/api/identity/login", HttpMethod.Post,
                new LoginRequest("another-tenant-participant", "ParticipantPassword123"), HttpStatusCode.NoContent);
            using (var denied = await otherTenant.GetAsync($"/api/learning/certificates/{certificateId}/pdf")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            using (var denied = await otherTenant.GetAsync($"/api/learning/lessons/{lessonId}/media")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            using (var denied = await otherTenant.GetAsync($"/api/learning/tracks/{trackId}/activities")) Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
            await using var alternativeLogo = typeof(CertificatePdfRenderer).Assembly.GetManifestResourceStream(
                "SipatOnline.Infrastructure.Learning.Assets.sipat-online-logo.png")!;
            using var logoBuffer = new MemoryStream();
            await alternativeLogo.CopyToAsync(logoBuffer);
            using (var changed = await UploadLogo(platform, logoPath, logoBuffer.ToArray())) Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            var storedJson = await db.ParticipationCertificates.AsNoTracking().Select(item => item.SnapshotJson).SingleAsync();
            using var snapshot = JsonDocument.Parse(storedJson);
            Assert.Equal(Convert.ToBase64String(Logo), snapshot.RootElement.GetProperty("companyLogo").GetProperty("data").GetString());
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var afterRestart = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}");
            Assert.True(afterRestart.GetProperty("lessons")[0].GetProperty("isCompleted").GetBoolean());
            Assert.Equal(900, afterRestart.GetProperty("lessons")[0].GetProperty("lastPlaybackPositionMilliseconds").GetInt64());
            Assert.Equal(1, await db.ParticipationCertificates.CountAsync());

            // programs: each day becomes its own track, so this runs after the certificate flow above
            var program = await Call(platform, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "SIPAT 2026",
                days = new[]
                {
                    new
                    {
                        id = (Guid?)null, title = "Dia 1 · Segurança no chão de fábrica", date = "2026-11-09", subject = "Segurança",
                        videoIds = new[] { videoId }, gameIds = new[] { moduleIds[0] }
                    }
                }
            }, HttpStatusCode.Created);
            var programId = program.GetProperty("id").GetGuid();
            var day = program.GetProperty("days")[0];
            Assert.Equal("Dia 1 · Segurança no chão de fábrica", day.GetProperty("title").GetString());
            Assert.Equal("2026-11-09", day.GetProperty("date").GetString());
            var dayId = day.GetProperty("id").GetGuid();
            Assert.NotEqual(Guid.Empty, dayId);
            await Call(platform, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "Vídeo repetido",
                days = new[] { new { id = (Guid?)null, title = "Dia 1", date = (string?)null, subject = (string?)null, videoIds = new[] { videoId, videoId }, gameIds = Array.Empty<Guid>() } }
            }, HttpStatusCode.BadRequest);
            await Call(platform, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "Dia sem título",
                days = new[] { new { id = (Guid?)null, title = "  ", date = (string?)null, subject = (string?)null, videoIds = new[] { videoId }, gameIds = Array.Empty<Guid>() } }
            }, HttpStatusCode.BadRequest);
            await Call(platform, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "Dia sem vídeos",
                days = new[] { new { id = (Guid?)null, title = "Dia 1", date = (string?)null, subject = (string?)null, videoIds = Array.Empty<Guid>(), gameIds = Array.Empty<Guid>() } }
            }, HttpStatusCode.BadRequest);
            await Call(platform, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "Vídeo que não existe",
                days = new[] { new { id = (Guid?)null, title = "Dia 1", date = (string?)null, subject = (string?)null, videoIds = new[] { Guid.NewGuid() }, gameIds = Array.Empty<Guid>() } }
            }, HttpStatusCode.NotFound);
            var applied = await Call(platform, $"{companyPath}/sipats/{sipatId}/programs/{programId}", HttpMethod.Post, new { });
            Assert.Equal(1, applied.GetProperty("days").GetInt32());
            Assert.Equal(1, applied.GetProperty("created").GetInt32());
            var reapplied = await Call(platform, $"{companyPath}/sipats/{sipatId}/programs/{programId}", HttpMethod.Post, new { });
            Assert.Equal(0, reapplied.GetProperty("created").GetInt32());
            Assert.Equal(1, reapplied.GetProperty("updated").GetInt32());
            var cards = await participant.GetFromJsonAsync<JsonElement>("/api/learning/tracks");
            var dayCard = cards.EnumerateArray().Single(card => card.GetProperty("dayTitle").ValueKind == JsonValueKind.String);
            Assert.Equal("Dia 1 · Segurança no chão de fábrica", dayCard.GetProperty("title").GetString());
            Assert.Equal("Dia 1 · Segurança no chão de fábrica", dayCard.GetProperty("dayTitle").GetString());
            Assert.Equal(1, dayCard.GetProperty("dayPosition").GetInt32());
            Assert.Equal("2026-11-09", dayCard.GetProperty("dayDate").GetString());
            Assert.Equal(1, dayCard.GetProperty("lessonCount").GetInt32());
            Assert.Equal(1000, dayCard.GetProperty("durationMilliseconds").GetInt64());
            var dayTrackId = dayCard.GetProperty("id").GetGuid();
            var dayActivities = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{dayTrackId}/activities");
            Assert.Equal(moduleIds[0], dayActivities.GetProperty("items")[0].GetProperty("module").GetProperty("id").GetGuid());
            await Call(platform, $"/api/platform/catalog/programs/{programId}", HttpMethod.Put, new
            {
                title = "SIPAT 2026 (revisado)",
                days = new[] { new { id = (Guid?)dayId, title = "Dia 1 · Saúde", date = "2026-11-10", subject = (string?)"Saúde", videoIds = new[] { videoId }, gameIds = Array.Empty<Guid>() } }
            });
            await Call(platform, $"{companyPath}/sipats/{sipatId}/programs/{programId}", HttpMethod.Post, new { });
            var renamed = (await participant.GetFromJsonAsync<JsonElement>("/api/learning/tracks")).EnumerateArray()
                .Single(card => card.GetProperty("id").GetGuid() == dayTrackId);
            Assert.Equal("Dia 1 · Saúde", renamed.GetProperty("dayTitle").GetString());
            Assert.Equal("2026-11-10", renamed.GetProperty("dayDate").GetString());
            await Call(platform, $"{companyPath}/sipats/{sipatId}/programs/{Guid.NewGuid()}", HttpMethod.Post, new { }, HttpStatusCode.NotFound);
            await Call(participant, "/api/platform/catalog/programs", HttpMethod.Post, new
            {
                title = "Sem permissão",
                days = new[] { new { title = "Dia 1", videoIds = new[] { videoId } } }
            }, HttpStatusCode.NotFound);
        }
        finally { await storage.DeleteAsync(videoId, CancellationToken.None); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void CertificatePdf_EmbedsCompanyLogoAndFontsWithinOneLandscapePageForLongNames(bool demonstration)
    {
        var certificate = new ParticipationCertificate(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            new string('W', 150), new string('M', 150), string.Join(" ", Enumerable.Repeat("Segurança e prevenção", 9)),
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1), 5055, DateTimeOffset.UtcNow, demonstration, "",
            new CertificateLogo(Logo, "image/png"));
        var bytes = new CertificatePdfRenderer().Render(certificate);
        using var stream = new MemoryStream(bytes);
        using var pdf = PdfReader.Open(stream, PdfDocumentOpenMode.Import);
        Assert.Single(pdf.Pages);
        Assert.Equal(842, pdf.Pages[0].Width.Point);
        Assert.Equal(595, pdf.Pages[0].Height.Point);
        Assert.Contains(certificate.EventTitle, pdf.Info.Title);
        Assert.Contains(pdf.Internals.GetAllObjects().OfType<PdfDictionary>(), item => item.Elements.ContainsKey("/FontFile2"));
        Assert.Contains(pdf.Internals.GetAllObjects().OfType<PdfDictionary>(),
            item => item.Elements.GetName("/Subtype") == "/Image" && item.Elements.GetInteger("/Width") == 1);
    }

    private static async Task CreateParticipant(UserManager<PlatformIdentityUser> users, Guid tenantId, string identifier)
    {
        var user = new PlatformIdentityUser
        {
            Id = Guid.NewGuid(),
            UserName = $"account-{Guid.NewGuid():N}",
            TenantId = tenantId,
            EmployeeIdentifier = identifier,
            NormalizedEmployeeIdentifier = identifier.ToUpperInvariant(),
            DisplayName = identifier,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        Assert.True((await users.CreateAsync(user, "ParticipantPassword123")).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, PlatformRoles.Participant)).Succeeded);
    }
    private static HttpClient Client(SipatOnlineApiFactory factory, string host = "integration-test.localhost") =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });

    private static async Task<JsonElement> Call(HttpClient client, string path, HttpMethod method, object body,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", await Token(client));
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        if (expected == HttpStatusCode.NoContent) return default;
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    private static async Task<string> Token(HttpClient client)
    {
        var result = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        Assert.NotNull(result?.RequestToken);
        return result.RequestToken;
    }

    private static async Task<HttpResponseMessage> UploadLogo(HttpClient client, string path, byte[] bytes)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = new ByteArrayContent(bytes) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        request.Headers.Add("X-CSRF-TOKEN", await Token(client));
        return await client.SendAsync(request);
    }
}
