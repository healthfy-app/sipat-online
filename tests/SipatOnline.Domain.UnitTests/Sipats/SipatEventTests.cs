using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Domain.UnitTests.Sipats;

public sealed class SipatEventTests
{
    private static readonly TenantId TenantId = new(Guid.Parse("11111111-1111-1111-1111-111111111111"));
    private static readonly DateTimeOffset StartsAt =
        new(2026, 10, 21, 9, 0, 0, TimeSpan.FromHours(-3));
    private static readonly DateTimeOffset EndsAt =
        new(2026, 10, 21, 17, 0, 0, TimeSpan.FromHours(-3));
    private static readonly DateTimeOffset CreatedAt =
        new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_WithValidValues_NormalizesAndStartsAsDraft()
    {
        var result = SipatEvent.Create(
            TenantId,
            "  SIPAT 2026 ",
            "  Prevenção e segurança  ",
            StartsAt,
            EndsAt,
            CreatedAt);

        Assert.True(result.IsSuccess);
        Assert.Equal("SIPAT 2026", result.Value.Title.Value);
        Assert.Equal("Prevenção e segurança", result.Value.Description);
        Assert.Equal(StartsAt.ToUniversalTime(), result.Value.StartsAt);
        Assert.Equal(EndsAt.ToUniversalTime(), result.Value.EndsAt);
        Assert.Equal(SipatEventStatus.Draft, result.Value.Status);
    }

    [Fact]
    public void Create_AllowsHistoricalEventDates()
    {
        var result = SipatEvent.Create(
            TenantId,
            "SIPAT histórica",
            null,
            StartsAt.AddYears(-1),
            EndsAt.AddYears(-1),
            CreatedAt);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public void Reconstitute_PreservesEventAndTenantIdentifiers()
    {
        var eventId = Guid.NewGuid();

        var result = SipatEvent.Reconstitute(
            eventId,
            TenantId,
            "SIPAT",
            null,
            StartsAt,
            EndsAt,
            CreatedAt,
            SipatEventStatus.Published);

        Assert.True(result.IsSuccess);
        Assert.Equal(eventId, result.Value.Id);
        Assert.Equal(TenantId, result.Value.TenantId);
        Assert.Equal(SipatEventStatus.Published, result.Value.Status);
    }

    [Theory]
    [InlineData("", "sipat.title.required")]
    [InlineData("   ", "sipat.title.required")]
    public void Create_WithInvalidTitle_ReturnsError(string title, string expectedErrorCode)
    {
        var result = SipatEvent.Create(TenantId, title, null, StartsAt, EndsAt, CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal(expectedErrorCode, result.Error.Code);
    }

    [Fact]
    public void Create_WhenEndIsNotAfterStart_ReturnsError()
    {
        var result = SipatEvent.Create(TenantId, "SIPAT", null, StartsAt, StartsAt, CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("sipat.schedule.invalid", result.Error.Code);
    }

    [Fact]
    public void Update_WhenCancelledFailsWithoutChangingEvent()
    {
        var sipatEvent = CreateSipatEvent();
        Assert.True(sipatEvent.Cancel().IsSuccess);

        var result = sipatEvent.Update("New title", null, StartsAt, EndsAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("sipat.cancelled", result.Error.Code);
        Assert.Equal("SIPAT", sipatEvent.Title.Value);
    }

    [Fact]
    public void Publish_OnlyTransitionsDraftToPublished()
    {
        var sipatEvent = CreateSipatEvent();

        Assert.True(sipatEvent.Publish().IsSuccess);
        Assert.Equal(SipatEventStatus.Published, sipatEvent.Status);
        Assert.False(sipatEvent.Publish().IsSuccess);
    }

    [Fact]
    public void CancelledEventCannotBePublishedOrCancelledAgain()
    {
        var sipatEvent = CreateSipatEvent();
        Assert.True(sipatEvent.Cancel().IsSuccess);

        Assert.False(sipatEvent.Publish().IsSuccess);
        Assert.False(sipatEvent.Cancel().IsSuccess);
        Assert.Equal(SipatEventStatus.Cancelled, sipatEvent.Status);
    }

    private static SipatEvent CreateSipatEvent()
    {
        var result = SipatEvent.Create(TenantId, "SIPAT", null, StartsAt, EndsAt, CreatedAt);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
