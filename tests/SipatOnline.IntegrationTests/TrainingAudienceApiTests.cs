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

        Assert.Empty(Targets(audience));
    }

    [DockerFact]
    public async Task The_groups_marked_read_back_on_the_training_and_on_its_card()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        var hr = await company.SectorAsync("RH");
        var it = await company.SectorAsync("TI");
        var training = await company.TrainingAsync("LGPD");
        // the HR of Minas, the IT of São Paulo, all of Rio
        (Guid?, Guid?)[] marked = [(minas, hr), (saoPaulo, it), (rio, null)];

        await company.AudienceAsync(training, marked);

        Assert.Equal(marked.Order(), Targets(await company.Get($"/api/admin/sipats/{training}/audience")).Order());
        var summary = (await company.Get("/api/admin/sipat-plans")).EnumerateArray().Single(item => item.GetProperty("sipatEventId").GetGuid() == training);
        Assert.Equal(marked.Order(), Targets(summary).Order());
    }

    [DockerFact]
    public async Task A_sector_of_a_unit_already_marked_whole_says_nothing_more_and_is_dropped()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");
        var hr = await company.SectorAsync("RH");
        var training = await company.TrainingAsync("SIPAT Minas");

        var saved = await company.AudienceAsync(training, [(minas, null), (minas, hr), (minas, null)]);

        Assert.Equal([(minas, null)], Targets(saved));
    }

    [DockerFact]
    public async Task A_unit_that_is_not_of_the_company_is_refused()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var training = await company.TrainingAsync("SIPAT 2026");

        var problem = await company.AudienceAsync(training, [(Guid.NewGuid(), null)], HttpStatusCode.BadRequest);

        Assert.Equal("audience.unit.invalid", problem.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task A_unit_put_away_cannot_be_added_but_one_already_there_stays()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        var first = await company.TrainingAsync("SIPAT SP");
        var second = await company.TrainingAsync("Incêndio");
        await company.AudienceAsync(first, [(saoPaulo, null)]);
        await company.Send(HttpMethod.Put, $"/api/admin/registry/units/{saoPaulo}", new { isActive = false });

        var kept = await company.AudienceAsync(first, [(saoPaulo, null), (rio, null)]);
        var refused = await company.AudienceAsync(second, [(saoPaulo, null)], HttpStatusCode.BadRequest);

        Assert.Equal(new (Guid?, Guid?)[] { (saoPaulo, null), (rio, null) }.Order(), Targets(kept).Order());
        Assert.Equal("audience.unit.invalid", refused.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task Count_says_who_receives_and_who_is_left_out_for_having_no_place()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        var hr = await company.SectorAsync("RH");
        // whoever the company starts with (its administrator also takes trainings) has no unit and no sector
        var alreadyThere = Counts(await company.CountAsync()).Receiving;
        await company.PersonAsync("ana", saoPaulo, hr);
        await company.PersonAsync("bruno", saoPaulo, hr);
        await company.PersonAsync("clara", saoPaulo);
        await company.PersonAsync("davi", rio, hr);
        await company.PersonAsync("elisa");

        Assert.Equal((5 + alreadyThere, 0), Counts(await company.CountAsync()));
        // all of São Paulo: Elisa and the ones already there have no unit
        Assert.Equal((3, 1 + alreadyThere), Counts(await company.CountAsync((saoPaulo, null))));
        // the HR of São Paulo: Clara is of the unit but has no sector
        Assert.Equal((2, 2 + alreadyThere), Counts(await company.CountAsync((saoPaulo, hr))));
        // the HR of every unit
        Assert.Equal((3, 2 + alreadyThere), Counts(await company.CountAsync((null, hr))));
    }

    private static (int Receiving, int LeftOutUnplaced) Counts(System.Text.Json.JsonElement count) =>
        (count.GetProperty("receiving").GetInt32(), count.GetProperty("leftOutUnplaced").GetInt32());
}
