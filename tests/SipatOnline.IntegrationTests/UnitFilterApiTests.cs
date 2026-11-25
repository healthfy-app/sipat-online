namespace SipatOnline.IntegrationTests;

/// <summary>With a unit chosen at the top, the pages of the company ask the server for the people of that unit only.</summary>
public sealed class UnitFilterApiTests
{
    [DockerFact]
    public async Task People_progress_and_profiles_come_for_one_unit_when_it_is_asked_for()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var rio = await company.UnitAsync("Rio de Janeiro");
        var ana = await company.PersonAsync("ana", saoPaulo);
        var bruno = await company.PersonAsync("bruno", saoPaulo);
        var bia = await company.PersonAsync("bia", rio);
        var caio = await company.PersonAsync("caio");
        var training = await company.TrainingAsync("SIPAT geral");
        await company.LaunchAsync(training);

        var people = await company.Get($"/api/admin/users/participants?unitId={saoPaulo}&limit=100");
        var progress = await company.Get($"/api/admin/learning/participation?unitId={saoPaulo}");
        var profiles = await company.Get($"/api/admin/users/participants/profiles?unitId={saoPaulo}");

        Guid[] ofSaoPaulo = [ana, bruno];
        Assert.Equal(2, people.GetProperty("totalCount").GetInt32());
        Assert.Equal(ofSaoPaulo.Order(), people.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).Order());
        // two days each, and nobody of another unit
        Assert.Equal(4, progress.GetArrayLength());
        Assert.All(progress.EnumerateArray(), row => Assert.Contains(row.GetProperty("participantId").GetGuid(), ofSaoPaulo));
        Assert.Equal(ofSaoPaulo.Order(), profiles.EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).Order());

        // without a unit, everyone comes, as before
        var everyone = (await company.Get("/api/admin/users/participants/profiles")).EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToArray();
        Assert.Contains(bia, everyone);
        Assert.Contains(caio, everyone);
        var allProgress = (await company.Get("/api/admin/learning/participation")).EnumerateArray().Select(row => row.GetProperty("participantId").GetGuid()).ToHashSet();
        Assert.Contains(bia, allProgress);
        Assert.True((await company.Get("/api/admin/users/participants?limit=100")).GetProperty("totalCount").GetInt32() >= 4);
    }

    [DockerFact]
    public async Task A_unit_of_another_company_brings_nobody()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        await company.PersonAsync("ana", saoPaulo);

        var stranger = Guid.NewGuid();
        Assert.Equal(0, (await company.Get($"/api/admin/users/participants?unitId={stranger}")).GetProperty("totalCount").GetInt32());
        Assert.Equal(0, (await company.Get($"/api/admin/learning/participation?unitId={stranger}")).GetArrayLength());
        Assert.Equal(0, (await company.Get($"/api/admin/users/participants/profiles?unitId={stranger}")).GetArrayLength());
    }
}
