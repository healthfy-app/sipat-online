using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Learning.Domain.Tracks;

namespace SipatOnline.Domain.UnitTests.Learning;

public sealed class LearningProgressTests
{
    private static readonly TenantId TenantId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    [Fact]
    public void SavingEndPosition_DoesNotCountAsWatchedOrComplete()
    {
        var progress = CreateProgress();

        var result = progress.SavePlaybackPosition(1000, DateTimeOffset.UtcNow.AddSeconds(1));

        Assert.True(result.IsSuccess);
        Assert.Equal(0, progress.WatchedPercentage);
        Assert.False(progress.IsCompleted);
        Assert.Equal(1000, progress.LastPlaybackPositionMilliseconds);
    }

    [Fact]
    public void VerifiedRanges_AreUnionedAndCompleteAtThreshold()
    {
        var progress = CreateProgress();
        var now = DateTimeOffset.UtcNow.AddSeconds(1);

        Assert.True(progress.RecordVerifiedRange(0, 500, now).IsSuccess);
        Assert.True(progress.RecordVerifiedRange(400, 900, now.AddSeconds(1)).IsSuccess);
        Assert.True(progress.RecordVerifiedRange(0, 500, now.AddSeconds(2)).IsSuccess);

        Assert.Equal(900, progress.WatchedMilliseconds);
        Assert.Equal(90, progress.WatchedPercentage);
        Assert.True(progress.IsCompleted);
        Assert.Equal(now.AddSeconds(1), progress.CompletedAt);
    }

    [Fact]
    public void VerifiedRanges_MergeAdjacentIntervals()
    {
        var progress = CreateProgress();
        var now = DateTimeOffset.UtcNow.AddSeconds(1);

        Assert.True(progress.RecordVerifiedRange(0, 400, now).IsSuccess);
        Assert.True(progress.RecordVerifiedRange(400, 900, now.AddSeconds(1)).IsSuccess);

        Assert.Equal(new WatchedRange(0, 900), Assert.Single(progress.WatchedRanges));
    }

    [Fact]
    public void VerifiedRangeOutsideDuration_IsRejectedWithoutChangingProgress()
    {
        var progress = CreateProgress();

        var result = progress.RecordVerifiedRange(0, 1001, DateTimeOffset.UtcNow.AddSeconds(1));

        Assert.False(result.IsSuccess);
        Assert.Equal("learning.progress.range_invalid", result.Error.Code);
        Assert.Empty(progress.WatchedRanges);
        Assert.False(progress.IsCompleted);
    }

    [Fact]
    public void CompletedProgress_RemainsCompletedWhenPositionChanges()
    {
        var progress = CreateProgress();
        var now = DateTimeOffset.UtcNow.AddSeconds(1);
        Assert.True(progress.RecordVerifiedRange(0, 900, now).IsSuccess);

        var result = progress.SavePlaybackPosition(100, now.AddSeconds(1));

        Assert.True(result.IsSuccess);
        Assert.True(progress.IsCompleted);
        Assert.Equal(now, progress.CompletedAt);
        Assert.Equal(100, progress.LastPlaybackPositionMilliseconds);
    }

    private static LearningProgress CreateProgress()
    {
        var result = LearningProgress.Start(
            TenantId,
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            1000,
            90,
            DateTimeOffset.UtcNow);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}

public sealed class LearningTrackRevisionTests
{
    private static readonly TenantId TenantId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    [Fact]
    public void PublishedRevision_IsImmutableAndNextRevisionGetsNewLessonIds()
    {
        var trackId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var draftResult = LearningTrackRevision.CreateDraft(trackId, TenantId, 1, now);
        Assert.True(draftResult.IsSuccess);
        var revision = draftResult.Value;
        var lessonResult = revision.AddLesson("Inspeção segura", null, "asset-123", 60000);
        Assert.True(lessonResult.IsSuccess);
        Assert.True(revision.Publish(now.AddMinutes(1)).IsSuccess);

        var rejectedChange = revision.AddLesson("Outro vídeo", null, "asset-456", 30000);
        var nextDraft = revision.CreateNextDraft(now.AddMinutes(2));

        Assert.False(rejectedChange.IsSuccess);
        Assert.True(nextDraft.IsSuccess);
        Assert.Equal(2, nextDraft.Value.RevisionNumber);
        Assert.Equal(lessonResult.Value.Title, Assert.Single(nextDraft.Value.Lessons).Title);
        Assert.NotEqual(lessonResult.Value.Id, Assert.Single(nextDraft.Value.Lessons).Id);
        Assert.Single(revision.Lessons);
    }

    [Fact]
    public void RevisionCannotPublishWithoutLessons()
    {
        var draft = LearningTrackRevision.CreateDraft(Guid.NewGuid(), TenantId, 1, DateTimeOffset.UtcNow);
        Assert.True(draft.IsSuccess);

        var result = draft.Value.Publish(DateTimeOffset.UtcNow.AddMinutes(1));

        Assert.False(result.IsSuccess);
        Assert.Equal("learning.revision.empty", result.Error.Code);
    }
}
