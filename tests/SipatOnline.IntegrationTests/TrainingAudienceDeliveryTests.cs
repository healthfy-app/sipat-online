namespace SipatOnline.IntegrationTests;

/// <summary>A training reaches the people of the units and sectors marked on it, and follows them when they move.</summary>
public sealed class TrainingAudienceDeliveryTests
{
    [DockerFact]
    public async Task Publishing_delivers_only_to_the_units_marked()
    {
        await using var company = await Company.StartAsync();

        Assert.Equal(2, await company.Scenario.DaysAsync("ana", company.Training));
        Assert.Equal(0, await company.Scenario.DaysAsync("bia", company.Training));
        Assert.Equal(0, await company.Scenario.DaysAsync("caio", company.Training));
    }

    [DockerFact]
    public async Task A_training_for_everyone_still_reaches_everyone()
    {
        await using var company = await Company.StartAsync();
        var general = await company.Scenario.TrainingAsync("SIPAT geral");
        await company.Scenario.LaunchAsync(general);

        foreach (var login in new[] { "ana", "bia", "caio" })
            Assert.Equal(2, await company.Scenario.DaysAsync(login, general));
    }

    [DockerFact]
    public async Task Unit_and_sector_together_narrow_it()
    {
        await using var company = await Company.StartAsync();
        var production = await company.Scenario.SectorAsync("Produção");
        await company.Scenario.PersonAsync("davi", company.SaoPaulo, production);
        var training = await company.Scenario.TrainingAsync("Produção SP");
        await company.Scenario.AudienceAsync(training, [(company.SaoPaulo, production)]);
        await company.Scenario.LaunchAsync(training);

        Assert.Equal(2, await company.Scenario.DaysAsync("davi", training));
        Assert.Equal(0, await company.Scenario.DaysAsync("ana", training)); // São Paulo, no sector
        Assert.Equal(0, await company.Scenario.DaysAsync("bia", training));
    }

    [DockerFact]
    public async Task The_hr_of_one_unit_and_the_it_of_another_reach_those_two_and_not_the_other_crossings()
    {
        await using var company = await Company.StartAsync();
        var minas = await company.Scenario.UnitAsync("Minas Gerais");
        var hr = await company.Scenario.SectorAsync("RH");
        var it = await company.Scenario.SectorAsync("TI");
        await company.Scenario.PersonAsync("lucia", minas, hr);
        await company.Scenario.PersonAsync("marcos", minas, it);
        await company.Scenario.PersonAsync("paula", company.SaoPaulo, it);
        await company.Scenario.PersonAsync("rita", company.SaoPaulo, hr);
        var training = await company.Scenario.TrainingAsync("LGPD");
        await company.Scenario.AudienceAsync(training, [(minas, hr), (company.SaoPaulo, it)]);
        await company.Scenario.LaunchAsync(training);

        Assert.Equal(2, await company.Scenario.DaysAsync("lucia", training)); // the HR of Minas
        Assert.Equal(2, await company.Scenario.DaysAsync("paula", training)); // the IT of São Paulo
        Assert.Equal(0, await company.Scenario.DaysAsync("marcos", training)); // Minas, but IT
        Assert.Equal(0, await company.Scenario.DaysAsync("rita", training)); // São Paulo, but HR
        Assert.Equal(0, await company.Scenario.DaysAsync("ana", training)); // São Paulo, no sector

        // Lúcia moves to the IT of Minas: she never opened it, so it leaves her
        await company.Scenario.PlaceAsync("sector", it, "lucia");
        Assert.Equal(0, await company.Scenario.DaysAsync("lucia", training));
    }

    [DockerFact]
    public async Task Someone_placed_in_the_unit_after_the_publication_receives_it()
    {
        await using var company = await Company.StartAsync();

        await company.Scenario.PersonAsync("novo", company.SaoPaulo);
        await company.Scenario.PersonAsync("novo.sem.unidade");

        Assert.Equal(2, await company.Scenario.DaysAsync("novo", company.Training));
        Assert.Equal(0, await company.Scenario.DaysAsync("novo.sem.unidade", company.Training));
    }

    [DockerFact]
    public async Task Moving_into_the_unit_delivers_at_once_and_says_so()
    {
        await using var company = await Company.StartAsync();

        var result = await company.Scenario.PlaceAsync("unit", company.SaoPaulo, "bia");

        Assert.Equal(1, result.GetProperty("changed").GetInt32());
        Assert.Equal(2, result.GetProperty("added").GetInt32());
        Assert.Equal(0, result.GetProperty("removed").GetInt32());
        Assert.Equal(["SIPAT SP"], result.GetProperty("receivedTrainings").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(2, await company.Scenario.DaysAsync("bia", company.Training));
    }

    [DockerFact]
    public async Task Moving_out_without_starting_takes_it_away()
    {
        await using var company = await Company.StartAsync();

        var result = await company.Scenario.PlaceAsync("unit", company.Rio, "ana");

        Assert.Equal(2, result.GetProperty("removed").GetInt32());
        Assert.Equal(0, await company.Scenario.DaysAsync("ana", company.Training));
    }

    [DockerFact]
    public async Task Moving_out_after_starting_one_day_keeps_every_day()
    {
        await using var company = await Company.StartAsync();
        await company.Scenario.StartWatchingAsync("ana", company.Training);

        var result = await company.Scenario.PlaceAsync("unit", company.Rio, "ana");

        Assert.Equal(0, result.GetProperty("removed").GetInt32());
        Assert.Equal(2, await company.Scenario.DaysAsync("ana", company.Training));
    }

    [DockerFact]
    public async Task Coming_back_to_the_unit_gives_it_again()
    {
        await using var company = await Company.StartAsync();

        await company.Scenario.PlaceAsync("unit", company.Rio, "ana");
        await company.Scenario.PlaceAsync("unit", company.SaoPaulo, "ana");

        Assert.Equal(2, await company.Scenario.DaysAsync("ana", company.Training));
    }

    [DockerFact]
    public async Task A_day_handed_to_someone_outside_is_never_taken()
    {
        await using var company = await Company.StartAsync();
        var minas = await company.Scenario.UnitAsync("Minas Gerais");
        await company.Scenario.HandFirstDayAsync("bia", company.Training);

        var result = await company.Scenario.PlaceAsync("unit", minas, "bia");

        Assert.Equal(0, result.GetProperty("removed").GetInt32());
        Assert.Equal(1, await company.Scenario.DaysAsync("bia", company.Training));
    }

    [DockerFact]
    public async Task Changing_the_unit_in_the_persons_form_delivers_too()
    {
        await using var company = await Company.StartAsync();
        var caio = await company.Scenario.PersonAsync("caio.form");

        await company.Scenario.Send(HttpMethod.Put, $"/api/admin/users/{caio:D}/profile", new { unitId = company.SaoPaulo });

        Assert.Equal(2, await company.Scenario.DaysAsync("caio.form", company.Training));
    }

    [DockerFact]
    public async Task Narrowing_a_published_training_removes_only_the_untouched()
    {
        await using var company = await Company.StartAsync();
        var general = await company.Scenario.TrainingAsync("SIPAT geral");
        await company.Scenario.LaunchAsync(general);
        await company.Scenario.StartWatchingAsync("ana", general);

        await company.Scenario.AudienceAsync(general, [(company.Rio, null)]);

        Assert.Equal(2, await company.Scenario.DaysAsync("ana", general)); // São Paulo, but already started
        Assert.Equal(2, await company.Scenario.DaysAsync("bia", general)); // Rio: still hers
        Assert.Equal(0, await company.Scenario.DaysAsync("caio", general)); // no unit, never opened it
    }

    [DockerFact]
    public async Task Widening_a_published_training_delivers_to_the_new_ones()
    {
        await using var company = await Company.StartAsync();

        await company.Scenario.AudienceAsync(company.Training, [(company.SaoPaulo, null), (company.Rio, null)]);

        Assert.Equal(2, await company.Scenario.DaysAsync("bia", company.Training));
        Assert.Equal(0, await company.Scenario.DaysAsync("caio", company.Training));
    }

    [DockerFact]
    public async Task A_unit_put_away_still_delivers_the_trainings_it_is_on()
    {
        await using var company = await Company.StartAsync();
        var draft = await company.Scenario.TrainingAsync("Incêndio SP");
        await company.Scenario.AudienceAsync(draft, [(company.SaoPaulo, null)]);
        await company.Scenario.Send(HttpMethod.Put, $"/api/admin/registry/units/{company.SaoPaulo}", new { isActive = false });

        await company.Scenario.LaunchAsync(draft);

        Assert.Equal(2, await company.Scenario.DaysAsync("ana", draft));
        Assert.Equal(0, await company.Scenario.DaysAsync("bia", draft));
    }

    /// <summary>São Paulo and Rio; Ana in São Paulo, Bia in Rio, Caio in no unit; "SIPAT SP", of two days, published for São Paulo.</summary>
    private sealed class Company(TrainingAudienceScenario scenario, Guid saoPaulo, Guid rio, Guid training) : IAsyncDisposable
    {
        public TrainingAudienceScenario Scenario => scenario;

        public Guid SaoPaulo => saoPaulo;

        public Guid Rio => rio;

        public Guid Training => training;

        public static async Task<Company> StartAsync()
        {
            var scenario = await TrainingAudienceScenario.StartAsync();
            var saoPaulo = await scenario.UnitAsync("São Paulo");
            var rio = await scenario.UnitAsync("Rio de Janeiro");
            await scenario.PersonAsync("ana", saoPaulo);
            await scenario.PersonAsync("bia", rio);
            await scenario.PersonAsync("caio");
            var training = await scenario.TrainingAsync("SIPAT SP");
            await scenario.AudienceAsync(training, [(saoPaulo, null)]);
            await scenario.LaunchAsync(training);
            return new Company(scenario, saoPaulo, rio, training);
        }

        public ValueTask DisposeAsync() => scenario.DisposeAsync();
    }
}
