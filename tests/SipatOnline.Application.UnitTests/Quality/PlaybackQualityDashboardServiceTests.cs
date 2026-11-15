using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Application.UnitTests.Quality;

public sealed class PlaybackQualityDashboardServiceTests
{
    [Fact]
    public async Task Refuses_anyone_who_is_not_the_platform_operator()
    {
        var service = Service(isOperator: false, tenantId: Guid.NewGuid());

        var company = await service.GetCompanyAsync(Guid.NewGuid(), null, null, CancellationToken.None);
        var comparison = await service.CompareAsync(null, null, CancellationToken.None);

        Assert.Equal("learning.playback_quality.forbidden", company.Error.Code);
        Assert.Equal("learning.playback_quality.forbidden", comparison.Error.Code);
    }

    [Fact]
    public async Task Refuses_an_operator_working_inside_a_company()
    {
        var service = Service(isOperator: true, tenantId: Guid.NewGuid());

        var company = await service.GetCompanyAsync(Guid.NewGuid(), null, null, CancellationToken.None);

        Assert.Equal("learning.playback_quality.forbidden", company.Error.Code);
    }

    private static PlaybackQualityDashboardService Service(bool isOperator, Guid? tenantId) =>
        new(new FakeTenant(tenantId), new FakeActor(isOperator), new NoStore(), TimeProvider.System);

    private sealed class FakeTenant(Guid? id) : ITenantContext
    {
        public TenantId? CurrentTenantId => id is null ? null : new TenantId(id.Value);
    }

    private sealed class FakeActor(bool isOperator) : ICurrentActor
    {
        public string? UserId => null;

        public bool IsInRole(string role) => isOperator && role == PlatformRoles.PlatformOperator;
    }

    private sealed class NoStore : IPlaybackQualityDashboardStore
    {
        public Task<CompanyQualityScope?> FindScopeAsync(Guid companyId, CancellationToken cancellationToken) =>
            throw new InvalidOperationException();

        public Task<QualityAggregate> AggregateAsync(Guid companyId, Guid sipatId, int? day, CancellationToken cancellationToken) =>
            throw new InvalidOperationException();

        public Task<IReadOnlyList<CompanyQualityTotals>> CompareAsync(
            DateTimeOffset from, DateTimeOffset toExclusive, CancellationToken cancellationToken) =>
            throw new InvalidOperationException();
    }
}
