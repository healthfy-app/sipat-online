using SipatOnline.Learning.Application;

namespace SipatOnline.Application.UnitTests.Learning;

public sealed class TrainingAudienceTests
{
    private static readonly Guid SaoPaulo = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid Rio = Guid.Parse("00000000-0000-0000-0000-000000000002");
    private static readonly Guid Production = Guid.Parse("00000000-0000-0000-0000-000000000011");
    private static readonly Guid Office = Guid.Parse("00000000-0000-0000-0000-000000000012");

    private static Guid? Id(string? name) => name switch
    {
        "sp" => SaoPaulo,
        "rio" => Rio,
        "production" => Production,
        "office" => Office,
        _ => null
    };

    private static TrainingAudience Audience(string units, string sectors) => new(
        units.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(name => Id(name)!.Value).ToHashSet(),
        sectors.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(name => Id(name)!.Value).ToHashSet());

    [Theory]
    // nothing marked: the whole company, placed or not
    [InlineData("", "", null, null, true)]
    [InlineData("", "", "rio", "office", true)]
    // one unit: its people, whatever the sector; nobody else, and nobody without a unit
    [InlineData("sp", "", "sp", null, true)]
    [InlineData("sp", "", "sp", "office", true)]
    [InlineData("sp", "", "rio", "office", false)]
    [InlineData("sp", "", null, "office", false)]
    // one sector: its people in every unit; nobody without a sector
    [InlineData("", "production", "rio", "production", true)]
    [InlineData("", "production", null, "production", true)]
    [InlineData("", "production", "sp", null, false)]
    [InlineData("", "production", "sp", "office", false)]
    // unit and sector: both must match
    [InlineData("sp", "production", "sp", "production", true)]
    [InlineData("sp", "production", "sp", "office", false)]
    [InlineData("sp", "production", "rio", "production", false)]
    // several units
    [InlineData("sp,rio", "", "sp", null, true)]
    [InlineData("sp,rio", "", "rio", null, true)]
    public void Includes_follows_units_and_sectors(string units, string sectors, string? unit, string? sector, bool expected)
    {
        Assert.Equal(expected, Audience(units, sectors).Includes(Id(unit), Id(sector)));
    }

    [Fact]
    public void Everyone_has_nothing_marked()
    {
        Assert.True(TrainingAudience.Everyone.IsEveryone);
        Assert.False(Audience("sp", "").IsEveryone);
        Assert.False(Audience("", "office").IsEveryone);
    }
}
