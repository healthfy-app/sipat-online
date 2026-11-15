using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Reads the quality dashboard. Every number is added up by PostgreSQL; only the groups come back,
/// never the session rows.
/// </summary>
public sealed class EfPlaybackQualityDashboardStore(PlatformDbContext dbContext) : IPlaybackQualityDashboardStore
{
    private const int MinimumSessionsPerVideo = 3;
    private const int MaximumVideos = 10;
    private const int MaximumPeople = 50;
    private const double ProblemStalledTimeShare = 0.10;

    public async Task<CompanyQualityScope?> FindScopeAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var company = await dbContext.Tenants.AsNoTracking()
            .Where(item => item.Id == companyId)
            .Select(item => new { item.Id, item.Name, item.Key })
            .FirstOrDefaultAsync(cancellationToken);
        if (company is null)
        {
            return null;
        }

        var sipats = await dbContext.SipatEvents.AsNoTracking()
            .Where(item => item.TenantId == companyId)
            .OrderByDescending(item => item.StartsAt)
            .Select(item => new
            {
                item.Id,
                item.Title,
                item.StartsAt,
                HasSessions = dbContext.PlaybackQualitySessions.Any(session =>
                    session.TenantId == companyId && session.SipatEventId == item.Id)
            })
            .ToListAsync(cancellationToken);

        var defaultSipat = sipats.FirstOrDefault(item => item.HasSessions) ?? sipats.FirstOrDefault();
        return new CompanyQualityScope(
            company.Id,
            company.Name,
            company.Key,
            sipats.Select(item => new SipatOption(item.Id, item.Title, item.StartsAt)).ToArray(),
            defaultSipat?.Id);
    }

    public async Task<QualityAggregate> AggregateAsync(
        Guid companyId, Guid sipatId, int? day, CancellationToken cancellationToken)
    {
        var sessions = dbContext.PlaybackQualitySessions.AsNoTracking()
            .Where(item => item.TenantId == companyId && item.SipatEventId == sipatId);
        var filtered = day is null ? sessions : sessions.Where(item => item.DayPosition == day);

        var totals = await TotalsAsync(filtered, cancellationToken);
        var byHour = await ByHourAsync(companyId, sipatId, day, cancellationToken);

        var byConnection = (await GroupTotals(filtered, item => (item.ConnectionType ?? "unknown").ToLower())
            .OrderByDescending(item => item.Totals.Sessions).ToListAsync(cancellationToken))
            .Select(item => new QualityBucket(item.Key, ToTotals(item))).ToArray();
        var byDevice = (await GroupTotals(filtered, item => item.Device.ToLower())
            .OrderByDescending(item => item.Totals.Sessions).ToListAsync(cancellationToken))
            .Select(item => new QualityBucket(item.Key, ToTotals(item))).ToArray();
        var byQuality = (await GroupTotals(filtered, item => item.Quality)
            .OrderByDescending(item => item.Totals.Sessions).ToListAsync(cancellationToken))
            .Select(item => new QualityBucket(item.Key, ToTotals(item))).ToArray();
        var byDay = (await GroupTotals(filtered, item => item.DayPosition)
            .OrderBy(item => item.Key).ToListAsync(cancellationToken))
            .Select(item => new QualityBucket(item.Key?.ToString(System.Globalization.CultureInfo.InvariantCulture), ToTotals(item)))
            .ToArray();

        var days = await sessions.Where(item => item.DayPosition != null)
            .Select(item => item.DayPosition!.Value)
            .Distinct()
            .OrderBy(item => item)
            .ToListAsync(cancellationToken);

        return new QualityAggregate(
            totals,
            byHour,
            byConnection,
            byDevice,
            byQuality,
            byDay,
            await VideosAsync(filtered, cancellationToken),
            await PeopleAsync(filtered, cancellationToken),
            days);
    }

    public async Task<IReadOnlyList<CompanyQualityTotals>> CompareAsync(
        DateTimeOffset from, DateTimeOffset toExclusive, CancellationToken cancellationToken)
    {
        var companies = await dbContext.Tenants.AsNoTracking()
            .Where(company => dbContext.SipatEvents.Any(sipat =>
                sipat.TenantId == company.Id && sipat.StartsAt < toExclusive && sipat.EndsAt >= from))
            .OrderBy(company => company.Name)
            .Select(company => new { company.Id, company.Name })
            .ToListAsync(cancellationToken);
        var ids = companies.Select(item => item.Id).ToArray();

        var rows = await GroupTotals(
                dbContext.PlaybackQualitySessions.AsNoTracking()
                    .Where(item => ids.Contains(item.TenantId) && item.StartedAt >= from && item.StartedAt < toExclusive),
                item => item.TenantId)
            .ToListAsync(cancellationToken);
        var byCompany = rows.ToDictionary(item => item.Key, ToTotals);

        return companies
            .Select(item => new CompanyQualityTotals(
                item.Id, item.Name, byCompany.GetValueOrDefault(item.Id) ?? EmptyTotals))
            .ToArray();
    }

    private static readonly QualityTotals EmptyTotals = new(0, 0, 0, 0, 0, null);

    private async Task<QualityTotals> TotalsAsync(
        IQueryable<PlaybackQualitySessionEntity> sessions, CancellationToken cancellationToken)
    {
        var row = await GroupTotals(sessions, _ => 1).FirstOrDefaultAsync(cancellationToken);
        return row is null ? EmptyTotals : ToTotals(row);
    }

    /// <summary>The hour is the viewer's local hour: the UTC start plus the offset the browser reported.</summary>
    private async Task<IReadOnlyList<HourBucket>> ByHourAsync(
        Guid companyId, Guid sipatId, int? day, CancellationToken cancellationToken)
    {
        var rows = await dbContext.Database.SqlQuery<HourRow>($"""
            SELECT CAST(EXTRACT(HOUR FROM ("StartedAt" AT TIME ZONE 'UTC') + "TimezoneOffsetMinutes" * INTERVAL '1 minute') AS integer) AS "Hour",
                   CAST(COUNT(*) AS integer) AS "Sessions",
                   CAST(COUNT(*) FILTER (WHERE NOT "NeverStarted" AND "StallCount" > 0) AS integer) AS "StalledSessions"
            FROM learning."PlaybackQualitySessions"
            WHERE "TenantId" = {companyId} AND "SipatEventId" = {sipatId}
              AND ({day}::integer IS NULL OR "DayPosition" = {day}::integer)
            GROUP BY 1
            """).ToListAsync(cancellationToken);

        var byHour = rows.ToDictionary(item => item.Hour);
        return Enumerable.Range(0, 24)
            .Select(hour => byHour.TryGetValue(hour, out var row)
                ? new HourBucket(hour, row.Sessions, row.StalledSessions)
                : new HourBucket(hour, 0, 0))
            .ToArray();
    }

    private async Task<IReadOnlyList<VideoQualityRow>> VideosAsync(
        IQueryable<PlaybackQualitySessionEntity> sessions, CancellationToken cancellationToken)
    {
        var rows = (await GroupTotals(sessions, item => item.VideoId ?? item.LessonId)
                .Where(item => item.Totals.Sessions >= MinimumSessionsPerVideo)
                .ToListAsync(cancellationToken))
            .Select(item => new { item.Key, Totals = ToTotals(item) })
            .OrderByDescending(item => StalledTimeShare(item.Totals))
            .ThenByDescending(item => item.Totals.Sessions)
            .Take(MaximumVideos)
            .ToArray();
        if (rows.Length == 0)
        {
            return [];
        }

        var keys = rows.Select(item => item.Key).ToArray();
        var videoTitles = await dbContext.PlatformCourseVideos.AsNoTracking()
            .Where(video => keys.Contains(video.Id))
            .Select(video => new { video.Id, video.Title })
            .ToDictionaryAsync(video => video.Id, video => video.Title, cancellationToken);
        var lessonTitles = await dbContext.LearningLessons.AsNoTracking()
            .Where(lesson => keys.Contains(lesson.Id))
            .Select(lesson => new { lesson.Id, lesson.Title })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row =>
            {
                if (videoTitles.TryGetValue(row.Key, out var videoTitle))
                {
                    return new VideoQualityRow(row.Key, videoTitle, row.Totals);
                }

                var lessonTitle = lessonTitles.FirstOrDefault(item => item.Id == row.Key)?.Title ?? string.Empty;
                return new VideoQualityRow(null, lessonTitle, row.Totals);
            })
            .ToArray();
    }

    private async Task<IReadOnlyList<ProblemParticipant>> PeopleAsync(
        IQueryable<PlaybackQualitySessionEntity> sessions, CancellationToken cancellationToken)
    {
        var rows = (await GroupTotals(sessions, item => item.ParticipantId)
                .Where(item => item.Totals.NeverStarted > 0
                    || item.Totals.StallMilliseconds > ProblemStalledTimeShare
                        * (item.Totals.WatchedMilliseconds + item.Totals.StallMilliseconds))
                .ToListAsync(cancellationToken))
            .Select(item => new { item.Key, Totals = ToTotals(item) })
            .OrderByDescending(item => item.Totals.NeverStarted)
            .ThenByDescending(item => StalledTimeShare(item.Totals))
            .Take(MaximumPeople)
            .ToArray();
        if (rows.Length == 0)
        {
            return [];
        }

        var ids = rows.Select(item => item.Key).ToArray();
        var users = await dbContext.Users.AsNoTracking()
            .Where(user => ids.Contains(user.Id))
            .Select(user => new { user.Id, user.DisplayName, user.EmployeeIdentifier })
            .ToDictionaryAsync(user => user.Id, cancellationToken);

        return rows
            .Select(row =>
            {
                users.TryGetValue(row.Key, out var user);
                return new ProblemParticipant(
                    row.Key,
                    user?.DisplayName ?? string.Empty,
                    user?.EmployeeIdentifier ?? string.Empty,
                    row.Totals.Sessions,
                    row.Totals.NeverStarted,
                    StalledTimeShare(row.Totals) * 100);
            })
            .ToArray();
    }

    private static double StalledTimeShare(QualityTotals totals)
    {
        var played = totals.WatchedMilliseconds + totals.StallMilliseconds;
        return played > 0 ? (double)totals.StallMilliseconds / played : 0;
    }

    private static IQueryable<GroupRow<TKey>> GroupTotals<TKey>(
        IQueryable<PlaybackQualitySessionEntity> sessions,
        System.Linq.Expressions.Expression<Func<PlaybackQualitySessionEntity, TKey>> key) =>
        sessions
            .GroupBy(key)
            .Select(group => new GroupRow<TKey>
            {
                Key = group.Key,
                Totals = new TotalsRow
                {
                    Sessions = group.Count(),
                    NeverStarted = group.Count(item => item.NeverStarted),
                    StalledSessions = group.Count(item => !item.NeverStarted && item.StallCount > 0),
                    StallMilliseconds = group.Sum(item => item.StallMilliseconds),
                    WatchedMilliseconds = group.Sum(item => item.WatchedMilliseconds),
                    AverageStartupMilliseconds = group.Average(item => item.StartupMilliseconds)
                }
            });

    private static QualityTotals ToTotals<TKey>(GroupRow<TKey> row) =>
        new(row.Totals.Sessions, row.Totals.NeverStarted, row.Totals.StalledSessions,
            row.Totals.StallMilliseconds, row.Totals.WatchedMilliseconds, row.Totals.AverageStartupMilliseconds);

    private sealed class GroupRow<TKey>
    {
        public TKey Key { get; set; } = default!;

        public TotalsRow Totals { get; set; } = new();
    }

    private sealed class TotalsRow
    {
        public int Sessions { get; set; }

        public int NeverStarted { get; set; }

        public int StalledSessions { get; set; }

        public long StallMilliseconds { get; set; }

        public long WatchedMilliseconds { get; set; }

        public double? AverageStartupMilliseconds { get; set; }
    }

    private sealed class HourRow
    {
        public int Hour { get; set; }

        public int Sessions { get; set; }

        public int StalledSessions { get; set; }
    }
}
