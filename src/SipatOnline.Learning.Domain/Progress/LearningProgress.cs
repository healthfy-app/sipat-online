using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Progress;

public sealed class LearningProgress
{
    private readonly List<WatchedRange> watchedRanges = [];

    private LearningProgress(
        Guid id,
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid revisionId,
        Guid lessonId,
        long durationMilliseconds,
        int completionThresholdPercent,
        long lastPlaybackPositionMilliseconds,
        DateTimeOffset firstStartedAt,
        DateTimeOffset lastAccessedAt,
        DateTimeOffset? completedAt,
        IEnumerable<WatchedRange> watchedRanges)
    {
        Id = id;
        TenantId = tenantId;
        ParticipantId = participantId;
        TrackId = trackId;
        RevisionId = revisionId;
        LessonId = lessonId;
        DurationMilliseconds = durationMilliseconds;
        CompletionThresholdPercent = completionThresholdPercent;
        LastPlaybackPositionMilliseconds = lastPlaybackPositionMilliseconds;
        FirstStartedAt = firstStartedAt.ToUniversalTime();
        LastAccessedAt = lastAccessedAt.ToUniversalTime();
        CompletedAt = completedAt?.ToUniversalTime();
        this.watchedRanges.AddRange(watchedRanges.OrderBy(range => range.StartMilliseconds));
    }

    public Guid Id { get; }

    public TenantId TenantId { get; }

    public Guid ParticipantId { get; }

    public Guid TrackId { get; }

    public Guid RevisionId { get; }

    public Guid LessonId { get; }

    public long DurationMilliseconds { get; }

    public int CompletionThresholdPercent { get; }

    public long LastPlaybackPositionMilliseconds { get; private set; }

    public DateTimeOffset FirstStartedAt { get; }

    public DateTimeOffset LastAccessedAt { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }

    public IReadOnlyList<WatchedRange> WatchedRanges => watchedRanges;

    public long WatchedMilliseconds => watchedRanges.Sum(range => range.LengthMilliseconds);

    public int WatchedPercentage =>
        (int)Math.Min(100m, (decimal)WatchedMilliseconds * 100 / DurationMilliseconds);

    public bool IsCompleted => CompletedAt is not null;

    public static Result<LearningProgress> Start(
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid revisionId,
        Guid lessonId,
        long durationMilliseconds,
        int completionThresholdPercent,
        DateTimeOffset startedAt)
    {
        if (tenantId.IsEmpty || participantId == Guid.Empty || trackId == Guid.Empty ||
            revisionId == Guid.Empty || lessonId == Guid.Empty)
        {
            return Failure("learning.progress.identities_required", "Os identificadores do progresso são obrigatórios.");
        }

        if (durationMilliseconds <= 0)
        {
            return Failure("learning.progress.duration_invalid", "A duração do vídeo deve ser positiva.");
        }

        if (completionThresholdPercent is < 1 or > 100)
        {
            return Failure(
                "learning.progress.threshold_invalid",
                "O percentual mínimo de conclusão deve estar entre 1 e 100.");
        }

        if (startedAt == default)
        {
            return Failure("learning.progress.date_required", "A data inicial do progresso é obrigatória.");
        }

        return Result<LearningProgress>.Success(
            new LearningProgress(
                Guid.NewGuid(),
                tenantId,
                participantId,
                trackId,
                revisionId,
                lessonId,
                durationMilliseconds,
                completionThresholdPercent,
                0,
                startedAt,
                startedAt,
                null,
                []));
    }

    public static Result<LearningProgress> Reconstitute(
        Guid id,
        TenantId tenantId,
        Guid participantId,
        Guid trackId,
        Guid revisionId,
        Guid lessonId,
        long durationMilliseconds,
        int completionThresholdPercent,
        long lastPlaybackPositionMilliseconds,
        DateTimeOffset firstStartedAt,
        DateTimeOffset lastAccessedAt,
        DateTimeOffset? completedAt,
        IEnumerable<WatchedRange> ranges)
    {
        if (id == Guid.Empty)
        {
            return Failure("learning.progress.id_required", "O identificador do progresso é obrigatório.");
        }

        var result = Start(
            tenantId,
            participantId,
            trackId,
            revisionId,
            lessonId,
            durationMilliseconds,
            completionThresholdPercent,
            firstStartedAt);
        if (!result.IsSuccess)
        {
            return result;
        }

        var materializedRanges = ranges.OrderBy(range => range.StartMilliseconds).ToArray();
        if (lastPlaybackPositionMilliseconds < 0 ||
            lastPlaybackPositionMilliseconds > durationMilliseconds ||
            materializedRanges.Any(range =>
                range.StartMilliseconds < 0 ||
                range.EndMilliseconds <= range.StartMilliseconds ||
                range.EndMilliseconds > durationMilliseconds) ||
            materializedRanges.Zip(materializedRanges.Skip(1))
                .Any(pair => pair.First.EndMilliseconds >= pair.Second.StartMilliseconds) ||
            lastAccessedAt < firstStartedAt ||
            (completedAt is not null && completedAt < firstStartedAt))
        {
            return Failure("learning.progress.persisted_data_invalid", "O progresso persistido é inválido.");
        }

        var progress = new LearningProgress(
            id,
            tenantId,
            participantId,
            trackId,
            revisionId,
            lessonId,
            durationMilliseconds,
            completionThresholdPercent,
            lastPlaybackPositionMilliseconds,
            firstStartedAt,
            lastAccessedAt,
            completedAt,
            materializedRanges);

        if ((completedAt is null) !=
        ((decimal)progress.WatchedMilliseconds * 100 <
         (decimal)durationMilliseconds * completionThresholdPercent))
        {
            return Failure("learning.progress.completion_invalid", "O estado de conclusão persistido é inválido.");
        }

        return Result<LearningProgress>.Success(progress);
    }

    public Result<LearningProgress> SavePlaybackPosition(long positionMilliseconds, DateTimeOffset accessedAt)
    {
        if (positionMilliseconds < 0 || positionMilliseconds > DurationMilliseconds)
        {
            return Failure("learning.progress.position_invalid", "A posição informada está fora do vídeo.");
        }

        if (accessedAt < LastAccessedAt || accessedAt == default)
        {
            return Failure("learning.progress.access_date_invalid", "A data de acesso é inválida.");
        }

        LastPlaybackPositionMilliseconds = positionMilliseconds;
        LastAccessedAt = accessedAt.ToUniversalTime();
        return Result<LearningProgress>.Success(this);
    }

    public Result<LearningProgress> RecordVerifiedRange(
        long startMilliseconds,
        long endMilliseconds,
        DateTimeOffset verifiedAt)
    {
        if (startMilliseconds < 0 ||
            endMilliseconds <= startMilliseconds ||
            endMilliseconds > DurationMilliseconds)
        {
            return Failure("learning.progress.range_invalid", "O intervalo reproduzido está fora do vídeo.");
        }

        if (verifiedAt < LastAccessedAt || verifiedAt == default)
        {
            return Failure("learning.progress.access_date_invalid", "A data de verificação é inválida.");
        }

        var start = startMilliseconds;
        var end = endMilliseconds;
        var merged = new List<WatchedRange>(watchedRanges.Count + 1);
        var inserted = false;

        foreach (var range in watchedRanges)
        {
            if (range.EndMilliseconds < start)
            {
                merged.Add(range);
            }
            else if (end < range.StartMilliseconds)
            {
                if (!inserted)
                {
                    merged.Add(new WatchedRange(start, end));
                    inserted = true;
                }

                merged.Add(range);
            }
            else
            {
                start = Math.Min(start, range.StartMilliseconds);
                end = Math.Max(end, range.EndMilliseconds);
            }
        }

        if (!inserted)
        {
            merged.Add(new WatchedRange(start, end));
        }

        watchedRanges.Clear();
        watchedRanges.AddRange(merged);
        LastAccessedAt = verifiedAt.ToUniversalTime();

        if (CompletedAt is null &&
            (decimal)WatchedMilliseconds * 100 >= (decimal)DurationMilliseconds * CompletionThresholdPercent)
        {
            CompletedAt = verifiedAt.ToUniversalTime();
        }

        return Result<LearningProgress>.Success(this);
    }

    private static Result<LearningProgress> Failure(string code, string message) =>
        Result<LearningProgress>.Failure(new DomainError(code, message));
}
