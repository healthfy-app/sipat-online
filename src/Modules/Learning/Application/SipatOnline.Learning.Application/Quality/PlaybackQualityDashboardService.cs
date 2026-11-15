using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Quality;

/// <summary>The video quality dashboard. Only the platform operator sees it.</summary>
public sealed class PlaybackQualityDashboardService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    IPlaybackQualityDashboardStore store,
    IPlaybackQualityPdfRenderer pdfRenderer,
    TimeProvider timeProvider)
{
    private const int DefaultPeriodDays = 90;
    private const int MaximumPeriodDays = 366;

    public async Task<Result<CompanyPlaybackQuality>> GetCompanyAsync(
        Guid companyId, Guid? sipatId, int? day, CancellationToken cancellationToken)
    {
        if (!IsOperator())
        {
            return Failure<CompanyPlaybackQuality>("learning.playback_quality.forbidden",
                "Somente a operação pode ver a qualidade do vídeo.");
        }

        var scope = await store.FindScopeAsync(companyId, cancellationToken);
        if (scope is null)
        {
            return Failure<CompanyPlaybackQuality>("learning.playback_quality.company_not_found", "A empresa não foi encontrada.");
        }

        if (sipatId is not null && scope.Sipats.All(item => item.Id != sipatId))
        {
            return Failure<CompanyPlaybackQuality>("learning.playback_quality.sipat_not_found",
                "A SIPAT não foi encontrada nesta empresa.");
        }

        var chosen = sipatId ?? scope.DefaultSipatId;
        var aggregate = chosen is null
            ? new QualityAggregate(new QualityTotals(0, 0, 0, 0, 0, null), EmptyHours(), [], [], [], [], [], [], [])
            : await store.AggregateAsync(companyId, chosen.Value, day, cancellationToken);

        return Result<CompanyPlaybackQuality>.Success(new CompanyPlaybackQuality(
            scope.CompanyId,
            scope.CompanyName,
            scope.CompanyKey,
            scope.Sipats,
            chosen,
            day,
            aggregate.Days,
            PlaybackQualityThresholds.Evaluate(aggregate.Totals),
            aggregate.ByHour,
            Evaluate(aggregate.ByConnection),
            Evaluate(aggregate.ByDevice),
            Evaluate(aggregate.ByQuality),
            Evaluate(aggregate.ByDay),
            aggregate.Videos
                .Select(item => new VideoQualityItem(item.VideoId, item.Title, PlaybackQualityThresholds.Evaluate(item.Totals)))
                .ToArray(),
            aggregate.People));
    }

    public async Task<Result<(byte[] Pdf, string FileName)>> RenderSummaryAsync(
        Guid companyId, Guid? sipatId, int? day, CancellationToken cancellationToken)
    {
        var result = await GetCompanyAsync(companyId, sipatId, day, cancellationToken);
        if (!result.IsSuccess)
        {
            return Result<(byte[] Pdf, string FileName)>.Failure(result.Error);
        }

        var quality = result.Value;
        var sipatTitle = quality.Sipats.FirstOrDefault(item => item.Id == quality.SipatId)?.Title ?? "Nenhuma SIPAT";
        var pdf = pdfRenderer.Render(new PlaybackQualityPdfContent(
            quality.CompanyName,
            sipatTitle,
            quality.Day is { } chosenDay ? $"Dia {chosenDay}" : "Todos os dias",
            quality.Indicators,
            quality.ByHour,
            PlaybackQualityConclusion.For(quality.Indicators, quality.ByHour),
            timeProvider.GetUtcNow()));
        return Result<(byte[] Pdf, string FileName)>.Success((pdf, $"qualidade-video-{quality.CompanyKey}.pdf"));
    }

    public async Task<Result<CompanyQualityComparison>> CompareAsync(
        DateOnly? from, DateOnly? to, CancellationToken cancellationToken)
    {
        if (!IsOperator())
        {
            return Failure<CompanyQualityComparison>("learning.playback_quality.forbidden",
                "Somente a operação pode ver a qualidade do vídeo.");
        }

        var end = to ?? DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var start = from ?? end.AddDays(-(DefaultPeriodDays - 1));
        if (start > end || end.DayNumber - start.DayNumber + 1 > MaximumPeriodDays)
        {
            return Failure<CompanyQualityComparison>("learning.playback_quality.period_invalid",
                "Escolha um período de até um ano.");
        }

        var companies = await store.CompareAsync(AtMidnightUtc(start), AtMidnightUtc(end.AddDays(1)), cancellationToken);
        return Result<CompanyQualityComparison>.Success(new CompanyQualityComparison(
            start,
            end,
            companies
                .Select(item => new CompanyQualityItem(item.CompanyId, item.Name, PlaybackQualityThresholds.Evaluate(item.Totals)))
                .ToArray()));
    }

    private bool IsOperator() =>
        currentActor.IsInRole(PlatformRoles.PlatformOperator) && tenantContext.CurrentTenantId is null;

    private static IReadOnlyList<QualityBreakdownItem> Evaluate(IReadOnlyList<QualityBucket> buckets) =>
        buckets.Select(item => new QualityBreakdownItem(item.Key, PlaybackQualityThresholds.Evaluate(item.Totals))).ToArray();

    private static DateTimeOffset AtMidnightUtc(DateOnly date) =>
        new(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    private static HourBucket[] EmptyHours() =>
        Enumerable.Range(0, 24).Select(hour => new HourBucket(hour, 0, 0)).ToArray();

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
