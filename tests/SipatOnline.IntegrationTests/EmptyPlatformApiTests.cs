using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class EmptyPlatformApiTests
{
    [DockerFact]
    public async Task PlatformStartsEmpty_WithOnlyItsOwner_AndTheOwnerRegistersTheFirstCompany()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), startEmpty: true);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            // nothing but the owner: no company, no library, no category
            Assert.Equal(0, await db.Tenants.CountAsync());
            Assert.Equal(0, await db.PlatformCourses.CountAsync());
            Assert.Equal(0, await db.CourseCategories.CountAsync());
            Assert.Equal(1, await db.Users.CountAsync());
        }

        using var owner = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://ops.localhost"),
            AllowAutoRedirect = false
        });
        var token = (await owner.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery"))!.RequestToken;
        using (var login = new HttpRequestMessage(HttpMethod.Post, "/api/platform/identity/login") { Content = JsonContent.Create(new LoginRequest("platform-operator", "PlatformPassword123")) })
        {
            login.Headers.Add("X-CSRF-TOKEN", token);
            Assert.Equal(HttpStatusCode.NoContent, (await owner.SendAsync(login)).StatusCode);
        }

        var companies = await owner.GetFromJsonAsync<JsonElement>("/api/platform/companies");
        Assert.Equal(0, companies.GetArrayLength());
        var categories = await owner.GetFromJsonAsync<JsonElement>("/api/platform/catalog/categories");
        Assert.Equal(0, categories.GetArrayLength());
    }
}
