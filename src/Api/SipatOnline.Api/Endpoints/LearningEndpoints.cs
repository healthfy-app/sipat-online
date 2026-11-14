using Microsoft.AspNetCore.Antiforgery;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Domain.Assignments;
using SipatOnline.Learning.Domain.Progress;
using SipatOnline.Learning.Domain.Tracks;

namespace SipatOnline.Api.Endpoints;

public static class LearningEndpoints
{
    public static IEndpointRouteBuilder MapLearningEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var admin = endpoints.MapGroup("/api/admin")
            .WithTags("Learning administration")
            .RequireAuthorization("ManageTenantSipats");

        var reports = endpoints.MapGroup("/api/admin")
            .WithTags("Learning reports")
            .RequireAuthorization("ViewTenantLearning");

        reports.MapGet("/learning/tracks", async (
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.ListTenantTracksAsync(cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ListTenantLearningTracks");

        reports.MapGet("/learning/participation", async (
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.ListParticipantProgressAsync(cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ListLearningParticipation");

        reports.MapGet("/learning/participants/{participantId:guid}/report", async (
            Guid participantId,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.GetParticipantReportAsync(participantId, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("GetLearningParticipantReport");

        admin.MapGet("/learning/tracks/{trackId:guid}/draft", async (
            Guid trackId,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.GetDraftAsync(trackId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("GetLearningTrackDraft");

        admin.MapPost("/sipats/{sipatEventId:guid}/tracks", async (
            Guid sipatEventId,
            CreateLearningTrackRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.CreateTrackAsync(
                sipatEventId,
                request.Title,
                request.Description,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/admin/learning/tracks/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreateLearningTrack");

        admin.MapPost("/learning/tracks/{trackId:guid}/lessons", async (
            Guid trackId,
            CreateLearningLessonRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.AddLessonAsync(
                trackId,
                request.Title,
                request.Description,
                request.ProviderAssetReference,
                request.DurationMilliseconds,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/admin/learning/lessons/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("AddLearningLesson");

        admin.MapPost("/learning/tracks/{trackId:guid}/revisions", async (
            Guid trackId,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.CreateNextRevisionAsync(trackId, cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/admin/learning/revisions/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreateLearningRevision");

        admin.MapPost("/learning/tracks/{trackId:guid}/publish", async (
            Guid trackId,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.PublishAsync(trackId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("PublishLearningTrack");

        admin.MapPost("/learning/tracks/{trackId:guid}/assignments", async (
            Guid trackId,
            AssignLearningTrackRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.AssignAsync(trackId, request.ParticipantId, cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/admin/learning/assignments/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("AssignLearningTrack");

        var participant = endpoints.MapGroup("/api/learning")
            .WithTags("Learning")
            .RequireAuthorization("ParticipateInLearning");

        participant.MapGet("/tracks", async (
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.ListAssignedAsync(cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ListAssignedLearningTracks");

        participant.MapGet("/tracks/{trackId:guid}", async (
            Guid trackId,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var result = await learningService.GetAssignedAsync(trackId, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("GetAssignedLearningTrack");

        participant.MapPost("/tracks/{trackId:guid}/lessons/{lessonId:guid}/playback", async (
            Guid trackId,
            Guid lessonId,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.StartPlaybackAsync(trackId, lessonId, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("StartLearningPlayback");

        participant.MapPut("/tracks/{trackId:guid}/lessons/{lessonId:guid}/position", async (
            Guid trackId,
            Guid lessonId,
            SavePlaybackPositionRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.SavePositionAsync(
                trackId,
                lessonId,
                request.PositionMilliseconds,
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SaveLearningPlaybackPosition");

        participant.MapPost("/tracks/{trackId:guid}/lessons/{lessonId:guid}/ranges", async (
            Guid trackId,
            Guid lessonId,
            RecordPlaybackRangeRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            LearningService learningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await learningService.RecordPlaybackRangeAsync(
                trackId,
                lessonId,
                request.SessionId,
                request.StartMilliseconds,
                request.EndMilliseconds,
                request.PositionMilliseconds,
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("RecordLearningPlaybackRange");

        return endpoints;
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "learning.forbidden" or "learning.actor_required" => StatusCodes.Status403Forbidden,
            "learning.track_not_found" or "learning.lesson_not_found" or
                "learning.sipat_not_found" or "learning.participant_not_found" => StatusCodes.Status404NotFound,
            "learning.assignment_exists" or "learning.track_not_published" or
                "learning.draft_not_found" or "learning.published_revision_not_found" or
                "learning.revision.immutable" or "learning.draft_exists" => StatusCodes.Status409Conflict,
            "learning.evidence_invalid" => StatusCodes.Status400BadRequest,
            "learning.video_provider_unavailable" => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

    private static async Task<IResult?> ValidateAntiforgeryAsync(
        IAntiforgery antiforgery,
        HttpContext context)
    {
        try
        {
            await antiforgery.ValidateRequestAsync(context);
            return null;
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Token antifalsificação inválido.");
        }
    }

    private static LearningTrackResponse ToResponse(LearningTrack track) =>
        new(
            track.Id,
            track.TenantId.Value,
            track.SipatEventId,
            track.Title,
            track.Description,
            track.CurrentRevisionId,
            track.CreatedAt);

    private static LearningTrackDraftResponse ToResponse(LearningTrackDraft draft) =>
        new(
            draft.TrackId,
            draft.SipatEventId,
            draft.Title,
            draft.Description,
            draft.RevisionId,
            draft.RevisionNumber,
            draft.Lessons
                .Select(lesson => new LearningDraftLessonResponse(
                    lesson.Id,
                    lesson.Title,
                    lesson.Description,
                    lesson.ProviderAssetReference,
                    lesson.Position,
                    lesson.DurationMilliseconds))
                .ToArray());

    private static LearningLessonResponse ToResponse(LearningLesson lesson) =>
        new(
            lesson.Id,
            lesson.Title,
            lesson.Description,
            lesson.Position,
            lesson.DurationMilliseconds);

    private static LearningTrackRevisionResponse ToResponse(LearningTrackRevision revision) =>
        new(
            revision.Id,
            revision.TrackId,
            revision.RevisionNumber,
            revision.Status.ToString(),
            revision.Lessons.Count,
            revision.PublishedAt);

    private static LearningAssignmentResponse ToResponse(LearningAssignment assignment) =>
        new(
            assignment.Id,
            assignment.TrackId,
            assignment.ParticipantId,
            assignment.AssignedAt);

    private static LearningProgressResponse ToResponse(LearningProgress progress) =>
        new(
            progress.LessonId,
            progress.LastPlaybackPositionMilliseconds,
            progress.DurationMilliseconds,
            progress.WatchedPercentage,
            progress.IsCompleted,
            progress.FirstStartedAt,
            progress.LastAccessedAt,
            progress.CompletedAt);
}

public sealed record CreateLearningTrackRequest(string? Title, string? Description);

public sealed record CreateLearningLessonRequest(
    string? Title,
    string? Description,
    string? ProviderAssetReference,
    long DurationMilliseconds);

public sealed record AssignLearningTrackRequest(Guid ParticipantId);

public sealed record SavePlaybackPositionRequest(long PositionMilliseconds);

public sealed record RecordPlaybackRangeRequest(
    Guid SessionId,
    long StartMilliseconds,
    long EndMilliseconds,
    long PositionMilliseconds);

public sealed record LearningTrackResponse(
    Guid Id,
    Guid TenantId,
    Guid SipatEventId,
    string Title,
    string? Description,
    Guid? CurrentRevisionId,
    DateTimeOffset CreatedAt);

public sealed record LearningTrackDraftResponse(
    Guid TrackId,
    Guid SipatEventId,
    string Title,
    string? Description,
    Guid RevisionId,
    int RevisionNumber,
    IReadOnlyList<LearningDraftLessonResponse> Lessons);

public sealed record LearningDraftLessonResponse(
    Guid Id,
    string Title,
    string? Description,
    string ProviderAssetReference,
    int Position,
    long DurationMilliseconds);

public sealed record LearningLessonResponse(
    Guid Id,
    string Title,
    string? Description,
    int Position,
    long DurationMilliseconds);

public sealed record LearningTrackRevisionResponse(
    Guid Id,
    Guid TrackId,
    int RevisionNumber,
    string Status,
    int LessonCount,
    DateTimeOffset? PublishedAt);

public sealed record LearningAssignmentResponse(
    Guid Id,
    Guid TrackId,
    Guid ParticipantId,
    DateTimeOffset AssignedAt);

public sealed record LearningProgressResponse(
    Guid LessonId,
    long LastPlaybackPositionMilliseconds,
    long DurationMilliseconds,
    int WatchedPercentage,
    bool IsCompleted,
    DateTimeOffset FirstStartedAt,
    DateTimeOffset LastAccessedAt,
    DateTimeOffset? CompletedAt);
