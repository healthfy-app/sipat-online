using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Domain.Quality;

namespace SipatOnline.Learning.Application.Quality;

/// <summary>Body of the quality summary. Names follow the JSON the browser sends; tenant and participant never come from it.</summary>
public sealed record PlaybackQualityRequest(
    Guid Id,
    Guid LessonId,
    Guid PlaybackSessionId,
    DateTimeOffset StartedAt,
    int TimezoneOffsetMinutes,
    long? StartupMs,
    bool NeverStarted,
    int StallCount,
    long StallMs,
    long WatchedMs,
    string? ErrorKind,
    string Quality,
    int QualitySwitches,
    string? ConnectionType,
    double? DownlinkMbps,
    string Device);

public sealed class PlaybackQualityService(
    ITenantContext tenant,
    ICurrentActor actor,
    ILearningStore learning,
    IPlaybackQualityStore store,
    TimeProvider clock)
{
    public async Task<Result<bool>> RecordAsync(
        Guid trackId,
        PlaybackQualityRequest request,
        CancellationToken cancellationToken)
    {
        if (!actor.IsInRole(PlatformRoles.Participant))
        {
            return Failure("learning.forbidden", "Esta área é exclusiva para participantes.");
        }

        if (!Guid.TryParse(actor.UserId, out var participantId) || participantId == Guid.Empty)
        {
            return Failure("learning.actor_required", "Não foi possível identificar o participante.");
        }

        if (tenant.CurrentTenantId is not { IsEmpty: false } tenantId)
        {
            return Failure("learning.tenant_required", "Não foi possível identificar a empresa.");
        }

        var lesson = await learning.FindAssignedLessonAsync(
            tenantId, participantId, trackId, request.LessonId, cancellationToken);
        if (lesson is null)
        {
            return Failure("learning.lesson_not_found", "O vídeo não foi encontrado ou não está disponível para você.");
        }

        if (lesson.IsBonus)
        {
            return Result<bool>.Failure(BonusLesson.Refused);
        }

        if (!TryParse<PlaybackDevice>(request.Device, out var device)
            || !TryParseOptional<PlaybackErrorKind>(request.ErrorKind, out var errorKind))
        {
            return Invalid();
        }

        var report = PlaybackQualityReport.Create(
            request.Id,
            request.LessonId,
            request.PlaybackSessionId,
            request.StartedAt,
            request.TimezoneOffsetMinutes,
            request.StartupMs,
            request.NeverStarted,
            request.StallCount,
            request.StallMs,
            request.WatchedMs,
            errorKind,
            request.Quality,
            request.QualitySwitches,
            request.ConnectionType,
            request.DownlinkMbps,
            device,
            clock.GetUtcNow());
        if (!report.IsSuccess)
        {
            return Result<bool>.Failure(report.Error);
        }

        return await store.UpsertAsync(tenantId.Value, participantId, report.Value, cancellationToken)
            ? Result<bool>.Success(true)
            : Invalid();
    }

    private static bool TryParse<TEnum>(string? text, out TEnum value)
        where TEnum : struct, Enum =>
        Enum.TryParse(text, ignoreCase: true, out value) && Enum.IsDefined(value) && !IsNumeric(text);

    private static bool TryParseOptional<TEnum>(string? text, out TEnum? value)
        where TEnum : struct, Enum
    {
        value = null;
        if (text is null)
        {
            return true;
        }

        if (!TryParse<TEnum>(text, out var parsed))
        {
            return false;
        }

        value = parsed;
        return true;
    }

    private static bool IsNumeric(string? text) =>
        text is { Length: > 0 } && (char.IsDigit(text[0]) || text[0] is '-' or '+');

    private static Result<bool> Invalid() =>
        Failure(PlaybackQualityReport.InvalidCode, "O resumo de qualidade do vídeo é inválido.");

    private static Result<bool> Failure(string code, string message) =>
        Result<bool>.Failure(new DomainError(code, message));
}
