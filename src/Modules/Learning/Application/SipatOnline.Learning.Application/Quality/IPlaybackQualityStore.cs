using SipatOnline.Learning.Domain.Quality;

namespace SipatOnline.Learning.Application.Quality;

public interface IPlaybackQualityStore
{
    /// <summary>Saves the report, replacing an earlier one with the same Id. False when the Id belongs to another person or company.</summary>
    Task<bool> UpsertAsync(
        Guid tenantId,
        Guid participantId,
        PlaybackQualityReport report,
        CancellationToken cancellationToken);
}
