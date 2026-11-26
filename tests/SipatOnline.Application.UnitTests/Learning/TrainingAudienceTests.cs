using SipatOnline.Learning.Application;

namespace SipatOnline.Application.UnitTests.Learning;

public sealed class TrainingAudienceTests
{
    private static readonly Guid SaoPaulo = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly Guid Minas = Guid.Parse("00000000-0000-0000-0000-000000000002");
    private static readonly Guid Hr = Guid.Parse("00000000-0000-0000-0000-000000000011");
    private static readonly Guid It = Guid.Parse("00000000-0000-0000-0000-000000000012");

    private static Guid? Id(string? name) => name switch
    {
        "sp" => SaoPaulo,
        "minas" => Minas,
        "hr" => Hr,
        "it" => It,
        _ => null
    };

    /// <summary>"minas/hr sp/it": the HR of Minas and the IT of São Paulo. "sp": all of São Paulo. "*/hr": the HR of every unit.</summary>
    private static TrainingAudience Audience(string targets) => new(
        targets.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(target =>
        {
            var parts = target.Split('/');
            return new AudienceTarget(Id(parts[0]), parts.Length > 1 ? Id(parts[1]) : null);
        }).ToArray());

    [Theory]
    // nothing marked: the whole company, placed or not
    [InlineData("", null, null, true)]
    [InlineData("", "minas", "it", true)]
    // a whole unit: its people, whatever the sector; nobody else, and nobody without a unit
    [InlineData("sp", "sp", null, true)]
    [InlineData("sp", "sp", "it", true)]
    [InlineData("sp", "minas", "it", false)]
    [InlineData("sp", null, "it", false)]
    // a sector of a unit: both must match
    [InlineData("minas/hr", "minas", "hr", true)]
    [InlineData("minas/hr", "minas", "it", false)]
    [InlineData("minas/hr", "minas", null, false)]
    [InlineData("minas/hr", "sp", "hr", false)]
    // the HR of Minas and the IT of São Paulo: those two, and not the two other crossings
    [InlineData("minas/hr sp/it", "minas", "hr", true)]
    [InlineData("minas/hr sp/it", "sp", "it", true)]
    [InlineData("minas/hr sp/it", "minas", "it", false)]
    [InlineData("minas/hr sp/it", "sp", "hr", false)]
    // a sector in every unit; nobody without a sector
    [InlineData("*/hr", "sp", "hr", true)]
    [InlineData("*/hr", null, "hr", true)]
    [InlineData("*/hr", "sp", null, false)]
    // a whole unit beside a sector of another
    [InlineData("sp minas/hr", "sp", "it", true)]
    [InlineData("sp minas/hr", "minas", "it", false)]
    public void Includes_whoever_falls_in_one_of_the_targets(string targets, string? unit, string? sector, bool expected)
    {
        Assert.Equal(expected, Audience(targets).Includes(Id(unit), Id(sector)));
    }

    [Fact]
    public void Everyone_has_no_target()
    {
        Assert.True(TrainingAudience.Everyone.IsEveryone);
        Assert.False(Audience("sp").IsEveryone);
        Assert.False(Audience("*/it").IsEveryone);
    }
}
