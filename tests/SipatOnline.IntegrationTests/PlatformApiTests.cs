using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Tenancy.Application.Provisioning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class PlatformApiTests
{
    [DockerFact]
    public async Task PlatformOperator_CreatesCompanyAndListsCompanyEmployeesWithScopedCompletionAcrossTracks()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(
            postgres.GetConnectionString(),
            developmentSampleEnabled: true);
        await InitializeDatabaseAsync(factory);
        using var client = CreateClient(factory);

        using var anonymousCompaniesResponse =
            await client.GetAsync("https://ops.localhost/api/platform/companies");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousCompaniesResponse.StatusCode);
        using var anonymousEmployeesResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.Empty:D}/employees");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousEmployeesResponse.StatusCode);

        var antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var loginResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/identity/login",
            new LoginRequest("platform-operator", "PlatformPassword123"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.NoContent, loginResponse.StatusCode);

        using var invalidEmployeePageResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.Empty:D}/employees?limit=0");
        Assert.Equal(HttpStatusCode.BadRequest, invalidEmployeePageResponse.StatusCode);
        using var tooLargeEmployeePageResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.Empty:D}/employees?limit=101");
        Assert.Equal(HttpStatusCode.BadRequest, tooLargeEmployeePageResponse.StatusCode);
        using var negativeEmployeeOffsetResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.Empty:D}/employees?offset=-1");
        Assert.Equal(HttpStatusCode.BadRequest, negativeEmployeeOffsetResponse.StatusCode);
        using var oversizedEmployeeSearchResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.Empty:D}/employees?search={new string('a', 129)}");
        Assert.Equal(HttpStatusCode.BadRequest, oversizedEmployeeSearchResponse.StatusCode);

        using var usersResponse =
            await client.GetAsync("https://ops.localhost/api/platform/users?offset=0&limit=100");
        Assert.Equal(HttpStatusCode.OK, usersResponse.StatusCode);
        using var usersJson = System.Text.Json.JsonDocument.Parse(
            await usersResponse.Content.ReadAsStringAsync());
        var usersPage = usersJson.RootElement;
        var users = usersPage.GetProperty("items").EnumerateArray().ToArray();
        var rootAdmin = Assert.Single(users, user =>
            user.GetProperty("loginIdentifier").GetString() == "admin-root");
        Assert.Equal("integration-test", rootAdmin.GetProperty("tenantKey").GetString());
        Assert.Contains(
            "SuperAdmin",
            rootAdmin.GetProperty("roles").EnumerateArray().Select(role => role.GetString()));
        Assert.DoesNotContain(users, user =>
            user.GetProperty("loginIdentifier").GetString() == "platform-operator");
        Assert.DoesNotContain(
            "passwordHash",
            usersJson.RootElement.GetRawText(),
            StringComparison.OrdinalIgnoreCase);
        using var oversizedUsersSearchResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/users?search={new string('a', 129)}");
        Assert.Equal(HttpStatusCode.BadRequest, oversizedUsersSearchResponse.StatusCode);
        using var invalidUsersRoleResponse =
            await client.GetAsync("https://ops.localhost/api/platform/users?role=PlatformOperator");
        Assert.Equal(HttpStatusCode.BadRequest, invalidUsersRoleResponse.StatusCode);

        using var companiesResponse =
            await client.GetAsync("https://ops.localhost/api/platform/companies");
        Assert.Equal(HttpStatusCode.OK, companiesResponse.StatusCode);
        var existingCompanies = await companiesResponse.Content.ReadFromJsonAsync<TenantSummary[]>();
        Assert.NotNull(existingCompanies);
        Assert.Contains(existingCompanies, company => company.Key == "integration-test");

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var createResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/companies",
            new CreateTenantRequest(
                "acme-health",
                "Acme Health",
                "acme-admin",
                "Acme Administrator",
                "ClientAdminPass123"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var company = await createResponse.Content.ReadFromJsonAsync<TenantSummary>();
        Assert.NotNull(company);
        Assert.Equal("acme-health", company.Key);

        using var maximumEmployeePageResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees?limit=100&search={new string('a', 128)}");
        Assert.Equal(HttpStatusCode.OK, maximumEmployeePageResponse.StatusCode);
        var maximumEmployeePage =
            await maximumEmployeePageResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(maximumEmployeePage);
        Assert.Empty(maximumEmployeePage.Items);

        using var missingCompanyEmployeesResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{Guid.NewGuid():D}/employees");
        Assert.Equal(HttpStatusCode.NotFound, missingCompanyEmployeesResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var participantCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/users",
            new CreatePlatformUserRequest(
                company.Id,
                "acme-participant",
                "Participante de demonstração",
                "DemoParticipantPass123",
                "Participant"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, participantCreateResponse.StatusCode);
        var participant = await participantCreateResponse.Content.ReadFromJsonAsync<PlatformUserSummary>();
        Assert.NotNull(participant);
        Assert.Equal(company.Id, participant.TenantId);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var unassignedParticipantCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/users",
            new CreatePlatformUserRequest(
                company.Id,
                "acme-unassigned",
                "Sem trilhas",
                "UnassignedParticipantPass123",
                "Participant"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, unassignedParticipantCreateResponse.StatusCode);

        using var filteredUsersResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/users?offset=0&limit=1&tenantId={company.Id:D}");
        Assert.Equal(HttpStatusCode.OK, filteredUsersResponse.StatusCode);
        var filteredUsersPage =
            await filteredUsersResponse.Content.ReadFromJsonAsync<PlatformUserDirectoryPage>();
        Assert.NotNull(filteredUsersPage);
        Assert.Equal(3, filteredUsersPage.TotalCount);
        Assert.Equal("acme-admin", Assert.Single(filteredUsersPage.Items).LoginIdentifier);

        using var filteredUsersBeyondPageResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/users?offset=1&limit=1&tenantId={company.Id:D}");
        Assert.Equal(HttpStatusCode.OK, filteredUsersBeyondPageResponse.StatusCode);
        var filteredUsersBeyondPage =
            await filteredUsersBeyondPageResponse.Content.ReadFromJsonAsync<PlatformUserDirectoryPage>();
        Assert.NotNull(filteredUsersBeyondPage);
        Assert.Equal(3, filteredUsersBeyondPage.TotalCount);
        Assert.Equal(
            "acme-participant",
            Assert.Single(filteredUsersBeyondPage.Items).LoginIdentifier);

        using var filteredUsersBySearchAndRoleResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/users?offset=0&limit=50&tenantId={company.Id:D}&search=acme-participant&role=participant");
        Assert.Equal(HttpStatusCode.OK, filteredUsersBySearchAndRoleResponse.StatusCode);
        var filteredUsersBySearchAndRolePage =
            await filteredUsersBySearchAndRoleResponse.Content.ReadFromJsonAsync<PlatformUserDirectoryPage>();
        Assert.NotNull(filteredUsersBySearchAndRolePage);
        Assert.Equal(1, filteredUsersBySearchAndRolePage.TotalCount);
        Assert.Equal("acme-participant", Assert.Single(filteredUsersBySearchAndRolePage.Items).LoginIdentifier);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var elevatedRoleResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/users",
            new CreatePlatformUserRequest(
                company.Id,
                "acme-superadmin",
                "Tentativa de elevação",
                "DemoParticipantPass123",
                "SuperAdmin"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Forbidden, elevatedRoleResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "ops.localhost");
        using var supervisorCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "ops.localhost",
            HttpMethod.Post,
            "/api/platform/users",
            new CreatePlatformUserRequest(
                company.Id,
                "acme-supervisor",
                "Supervisor da empresa",
                "SupervisorPass123",
                "Supervisor"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, supervisorCreateResponse.StatusCode);
        var supervisor = await supervisorCreateResponse.Content.ReadFromJsonAsync<PlatformUserSummary>();
        Assert.NotNull(supervisor);
        Assert.Equal(company.Id, supervisor.TenantId);

        using var tenantBrandingResponse =
            await client.GetAsync("https://acme-health.localhost/api/tenant/branding");
        Assert.Equal(HttpStatusCode.OK, tenantBrandingResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var clientAdminLoginResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest("acme-admin", "ClientAdminPass123"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.NoContent, clientAdminLoginResponse.StatusCode);

        using var adminSessionResponse =
            await client.GetAsync("https://acme-health.localhost/api/identity/session");
        Assert.Equal(HttpStatusCode.OK, adminSessionResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        var now = DateTimeOffset.UtcNow;
        using var sipatCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            "/api/admin/sipats",
            new SipatEventDataRequest(
                "SIPAT de demonstração",
                "Programação de demonstração do portal.",
                now,
                now.AddDays(7)),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, sipatCreateResponse.StatusCode);
        using var sipatJson = System.Text.Json.JsonDocument.Parse(
            await sipatCreateResponse.Content.ReadAsStringAsync());
        var sipatId = sipatJson.RootElement.GetProperty("id").GetGuid();

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var trackCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/sipats/{sipatId:D}/tracks",
            new { title = "Trilha de demonstração", description = "Conteúdo para a demo." },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, trackCreateResponse.StatusCode);
        using var trackJson = System.Text.Json.JsonDocument.Parse(
            await trackCreateResponse.Content.ReadAsStringAsync());
        var trackId = trackJson.RootElement.GetProperty("id").GetGuid();

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var lessonCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{trackId:D}/lessons",
            new
            {
                title = "Vídeo técnico de demonstração",
                description = "Amostra CC0 da MDN, não pertencente ao catálogo comercial.",
                providerAssetReference = "development:mdn-flower-demo",
                durationMilliseconds = 5055
            },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, lessonCreateResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var secondTrackCreateResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/sipats/{sipatId:D}/tracks",
            new
            {
                title = "Trilha complementar",
                description = "Segunda trilha para validar o progresso consolidado."
            },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, secondTrackCreateResponse.StatusCode);
        using var secondTrackJson = System.Text.Json.JsonDocument.Parse(
            await secondTrackCreateResponse.Content.ReadAsStringAsync());
        var secondTrackId = secondTrackJson.RootElement.GetProperty("id").GetGuid();

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var secondTrackLessonResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{secondTrackId:D}/lessons",
            new
            {
                title = "Vídeo complementar",
                description = "Aula da segunda trilha.",
                providerAssetReference = "development:mdn-flower-demo",
                durationMilliseconds = 7000
            },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, secondTrackLessonResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var trackPublishResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{trackId:D}/publish",
            new { },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.OK, trackPublishResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var secondTrackPublishResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{secondTrackId:D}/publish",
            new { },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.OK, secondTrackPublishResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var assignmentResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{trackId:D}/assignments",
            new AssignLearningTrackRequest(participant.Id),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, assignmentResponse.StatusCode);

        antiforgeryToken = await GetAntiforgeryTokenAsync(client, "acme-health.localhost");
        using var secondTrackAssignmentResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{secondTrackId:D}/assignments",
            new AssignLearningTrackRequest(participant.Id),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.Created, secondTrackAssignmentResponse.StatusCode);

        using var employeesResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees?offset=0&limit=1");
        Assert.Equal(HttpStatusCode.OK, employeesResponse.StatusCode);
        var employeesPage = await employeesResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(employeesPage);
        Assert.Equal("Acme Health", employeesPage.CompanyName);
        Assert.Equal(2, employeesPage.TotalCount);
        var listedEmployee = Assert.Single(employeesPage.Items);
        Assert.Equal("acme-participant", listedEmployee.LoginIdentifier);
        Assert.Equal(0, listedEmployee.ProgressPercentage);
        Assert.Equal(0, listedEmployee.CompletedLessonCount);
        Assert.Equal(2, listedEmployee.LessonCount);

        using var secondEmployeePageResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees?offset=1&limit=1");
        Assert.Equal(HttpStatusCode.OK, secondEmployeePageResponse.StatusCode);
        var secondEmployeePage =
            await secondEmployeePageResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(secondEmployeePage);
        var unassignedEmployee = Assert.Single(secondEmployeePage.Items);
        Assert.Equal("acme-unassigned", unassignedEmployee.LoginIdentifier);
        Assert.Equal(0, unassignedEmployee.ProgressPercentage);
        Assert.Equal(0, unassignedEmployee.LessonCount);
        using var employeeNameSearchResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees?search=Sem%20trilhas");
        Assert.Equal(HttpStatusCode.OK, employeeNameSearchResponse.StatusCode);
        var employeeNameSearchPage =
            await employeeNameSearchResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(employeeNameSearchPage);
        Assert.Equal(
            "acme-unassigned",
            Assert.Single(employeeNameSearchPage.Items).LoginIdentifier);

        using var participantClient = CreateClient(factory);
        antiforgeryToken = await GetAntiforgeryTokenAsync(participantClient, "acme-health.localhost");
        using var participantLoginResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            "acme-health.localhost",
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest("acme-participant", "DemoParticipantPass123"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.NoContent, participantLoginResponse.StatusCode);

        using var assignedTracksResponse =
            await participantClient.GetAsync("https://acme-health.localhost/api/learning/tracks");
        Assert.Equal(HttpStatusCode.OK, assignedTracksResponse.StatusCode);
        using var assignedTracksJson = System.Text.Json.JsonDocument.Parse(
            await assignedTracksResponse.Content.ReadAsStringAsync());
        var assignedTracks = assignedTracksJson.RootElement.EnumerateArray().ToArray();
        Assert.Equal(2, assignedTracks.Length);
        var assignedTrack = Assert.Single(
            assignedTracks,
            item => item.GetProperty("title").GetString() == "Trilha de demonstração");
        Assert.Equal("Trilha de demonstração", assignedTrack.GetProperty("title").GetString());
        Assert.Equal(0, assignedTrack.GetProperty("progressPercentage").GetInt32());

        using var experienceResponse = await participantClient.GetAsync(
            $"https://acme-health.localhost/api/learning/tracks/{trackId:D}");
        Assert.Equal(HttpStatusCode.OK, experienceResponse.StatusCode);
        using var experienceJson = System.Text.Json.JsonDocument.Parse(
            await experienceResponse.Content.ReadAsStringAsync());
        var experienceLessons = experienceJson.RootElement.GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Single(experienceLessons);
        var lesson = experienceLessons[0];

        antiforgeryToken = await GetAntiforgeryTokenAsync(participantClient, "acme-health.localhost");
        using var playbackResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            "acme-health.localhost",
            HttpMethod.Post,
            $"/api/learning/tracks/{trackId:D}/lessons/{lesson.GetProperty("id").GetGuid():D}/playback",
            new { },
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.OK, playbackResponse.StatusCode);
        using var playbackJson = System.Text.Json.JsonDocument.Parse(
            await playbackResponse.Content.ReadAsStringAsync());
        Assert.True(playbackJson.RootElement.GetProperty("isDevelopmentDemo").GetBoolean());
        Assert.Equal(
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            playbackJson.RootElement.GetProperty("url").GetString());

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var trackEntity = await dbContext.LearningTracks.SingleAsync(track => track.Id == trackId);
        var progress = new LearningProgressEntity
        {
            Id = Guid.NewGuid(),
            TenantId = company.Id,
            ParticipantId = participant.Id,
            TrackId = trackId,
            RevisionId = trackEntity.CurrentRevisionId!.Value,
            LessonId = lesson.GetProperty("id").GetGuid(),
            DurationMilliseconds = 5055,
            CompletionThresholdPercent = 80,
            LastPlaybackPositionMilliseconds = 5055,
            WatchedRangesJson = "[]",
            FirstStartedAt = now,
            LastAccessedAt = now,
            CompletedAt = now
        };
        dbContext.LearningProgress.Add(progress);
        var participantEntity = await dbContext.Users.SingleAsync(user => user.Id == participant.Id);
        participantEntity.IsActive = false;
        await dbContext.SaveChangesAsync();

        using var employeesDefaultFilterResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees");
        Assert.Equal(HttpStatusCode.OK, employeesDefaultFilterResponse.StatusCode);
        var activeEmployeesPage =
            await employeesDefaultFilterResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(activeEmployeesPage);
        var remainingActiveEmployee = Assert.Single(activeEmployeesPage.Items);
        Assert.Equal("acme-unassigned", remainingActiveEmployee.LoginIdentifier);
        Assert.Equal(0, remainingActiveEmployee.ProgressPercentage);
        Assert.Equal(0, remainingActiveEmployee.LessonCount);
        Assert.Equal(1, activeEmployeesPage.TotalCount);

        using var employeesWithInactiveResponse = await client.GetAsync(
            $"https://ops.localhost/api/platform/companies/{company.Id:D}/employees?search=ACME-PARTICIPANT&includeInactive=true&offset=0&limit=1");
        Assert.Equal(HttpStatusCode.OK, employeesWithInactiveResponse.StatusCode);
        var employeesWithInactivePage =
            await employeesWithInactiveResponse.Content.ReadFromJsonAsync<PlatformCompanyEmployeePage>();
        Assert.NotNull(employeesWithInactivePage);
        var inactiveEmployee = Assert.Single(employeesWithInactivePage.Items);
        Assert.False(inactiveEmployee.IsActive);
        Assert.Equal(50, inactiveEmployee.ProgressPercentage);
        Assert.Equal(1, inactiveEmployee.CompletedLessonCount);
        Assert.Equal(2, inactiveEmployee.LessonCount);

        var tenantAdmin = await dbContext.Users.SingleAsync(
            user => user.TenantId == company.Id && user.EmployeeIdentifier == "acme-admin");
        Assert.Equal("acme-admin", tenantAdmin.EmployeeIdentifier);
        Assert.True(tenantAdmin.IsActive);
        var participantAudit = await dbContext.AuditEntries.SingleAsync(
            audit => audit.Action == "identity.platform_user.provisioned" &&
                     audit.SubjectId == participant.Id.ToString("D"));
        Assert.Equal(company.Id, participantAudit.TenantId);
    }

    [DockerFact]
    public async Task TenantSuperAdmin_CannotAccessPlatformCompanyOrEmployeeDirectory()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var client = CreateClient(factory);

        var antiforgeryToken = await GetAntiforgeryTokenAsync(client, "integration-test.localhost");
        using var loginResponse = await SendJsonWithAntiforgeryAsync(
            client,
            "integration-test.localhost",
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest("admin-root", "AdminPassword123"),
            antiforgeryToken);
        Assert.Equal(HttpStatusCode.NoContent, loginResponse.StatusCode);

        var authCookie = Assert.Single(
            loginResponse.Headers.GetValues("Set-Cookie"),
            value => value.StartsWith("__Host-SipatOnline.Auth=", StringComparison.Ordinal))
            .Split(';', 2)[0];
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            "https://ops.localhost/api/platform/companies");
        request.Headers.Add("Cookie", authCookie);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        using var directoryRequest = new HttpRequestMessage(
            HttpMethod.Get,
            "https://ops.localhost/api/platform/users");
        directoryRequest.Headers.Add("Cookie", authCookie);
        using var directoryResponse = await client.SendAsync(directoryRequest);

        Assert.Equal(HttpStatusCode.Forbidden, directoryResponse.StatusCode);

        using var employeeRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://ops.localhost/api/platform/companies/{Guid.NewGuid():D}/employees");
        employeeRequest.Headers.Add("Cookie", authCookie);
        using var employeeResponse = await client.SendAsync(employeeRequest);

        Assert.Equal(HttpStatusCode.Forbidden, employeeResponse.StatusCode);

        using var provisionRequest = new HttpRequestMessage(
            HttpMethod.Post,
            "https://ops.localhost/api/platform/users")
        {
            Content = JsonContent.Create(new CreatePlatformUserRequest(
                Guid.NewGuid(),
                "forbidden-user",
                "Conta não autorizada",
                "DemoParticipantPass123",
                "Participant"))
        };
        provisionRequest.Headers.Add("Cookie", authCookie);
        using var provisionResponse = await client.SendAsync(provisionRequest);

        Assert.Equal(HttpStatusCode.Forbidden, provisionResponse.StatusCode);
    }

    private static HttpClient CreateClient(SipatOnlineApiFactory factory) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });

    private static async Task InitializeDatabaseAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    private static async Task<string> GetAntiforgeryTokenAsync(HttpClient client, string host)
    {
        using var response = await client.GetAsync($"https://{host}/api/identity/antiforgery");
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token?.RequestToken);
        return token.RequestToken;
    }

    private static async Task<HttpResponseMessage> SendJsonWithAntiforgeryAsync<TRequest>(
        HttpClient client,
        string host,
        HttpMethod method,
        string path,
        TRequest requestBody,
        string token)
    {
        using var request = new HttpRequestMessage(method, $"https://{host}{path}")
        {
            Content = JsonContent.Create(requestBody)
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
}
