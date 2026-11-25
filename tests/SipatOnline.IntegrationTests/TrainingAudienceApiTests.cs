using System.Net;
using static SipatOnline.IntegrationTests.TrainingAudienceScenario;

namespace SipatOnline.IntegrationTests;

public sealed class TrainingAudienceApiTests
{
    [DockerFact]
    public async Task Audience_starts_as_everyone()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var training = await company.TrainingAsync("SIPAT 2026");

        var audience = await company.Get($"/api/admin/sipats/{training}/audience");

        Assert.Empty(Ids(audience, "unitIds"));
        Assert.Empty(Ids(audience, "sectorIds"));
    }

    [DockerFact]
    public async Task Saving_units_and_sectors_reads_back()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var production = await company.SectorAsync("Produção");
        var training = await company.TrainingAsync("SIPAT SP");

        await company.AudienceAsync(training, [saoPaulo], [production]);

        var audience = await company.Get($"/api/admin/sipats/{training}/audience");
        Assert.Equal([saoPaulo], Ids(audience, "unitIds"));
        Assert.Equal([production], Ids(audience, "sectorIds"));
        var summary = (await company.Get("/api/admin/sipat-plans")).EnumerateArray().Single(item => item.GetProperty("sipatEventId").GetGuid() == training);
        Assert.Equal([saoPaulo], Ids(summary, "unitIds"));
        Assert.Equal([production], Ids(summary, "sectorIds"));
    }

    [DockerFact]
    public async Task A_unit_that_is_not_of_the_company_is_refused()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var training = await company.TrainingAsync("SIPAT 2026");

        var problem = await company.AudienceAsync(training, [Guid.NewGuid()], expected: HttpStatusCode.BadRequest);

        Assert.Equal("audience.unit.invalid", problem.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task An_inactive_unit_cannot_be_added_but_one_already_there_stays()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        var first = await company.TrainingAsync("SIPAT SP");
        var second = await company.TrainingAsync("Incêndio");
        await company.AudienceAsync(first, [saoPaulo]);
        await company.Send(HttpMethod.Put, $"/api/admin/registry/units/{saoPaulo}", new { isActive = false });

        var kept = await company.AudienceAsync(first, [saoPaulo, rio]);
        var refused = await company.AudienceAsync(second, [saoPaulo], expected: HttpStatusCode.BadRequest);

        Assert.Equal(new[] { saoPaulo, rio }.Order(), Ids(kept, "unitIds").Order());
        Assert.Equal("audience.unit.invalid", refused.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task Count_says_who_receives_and_who_is_left_out()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        // whoever the company starts with (its administrator also takes trainings) has no unit
        var alreadyThere = Counts(await company.Send(HttpMethod.Post, "/api/admin/registry/audience-count", new { unitIds = Array.Empty<Guid>(), sectorIds = Array.Empty<Guid>() })).Receiving;
        foreach (var login in new[] { "ana", "bruno", "clara" }) await company.PersonAsync(login, saoPaulo);
        foreach (var login in new[] { "davi", "elisa" }) await company.PersonAsync(login, rio);
        await company.PersonAsync("fabio");

        var forSaoPaulo = await company.Send(HttpMethod.Post, "/api/admin/registry/audience-count", new { unitIds = new[] { saoPaulo }, sectorIds = Array.Empty<Guid>() });
        var forEveryone = await company.Send(HttpMethod.Post, "/api/admin/registry/audience-count", new { unitIds = Array.Empty<Guid>(), sectorIds = Array.Empty<Guid>() });

        Assert.Equal((3, 1 + alreadyThere, 0), Counts(forSaoPaulo));
        Assert.Equal((6 + alreadyThere, 0, 0), Counts(forEveryone));
    }

    private static (int Receiving, int WithoutUnit, int WithoutSector) Counts(System.Text.Json.JsonElement count) =>
        (count.GetProperty("receiving").GetInt32(), count.GetProperty("withoutUnit").GetInt32(), count.GetProperty("withoutSector").GetInt32());
}
