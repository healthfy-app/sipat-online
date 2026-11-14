using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public sealed class GameModuleService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    IGameModuleStore moduleStore,
    IPlatformCourseCatalogStore catalogStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    private const int MaximumQuestions = 50;
    private const int MaximumOptions = 6;
    private const int MaximumItems = 50;

    public async Task<Result<IReadOnlyList<LibraryGameModule>>> ListAsync(
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        return permission.IsSuccess
            ? Result<IReadOnlyList<LibraryGameModule>>.Success(await moduleStore.ListAsync(cancellationToken))
            : Result<IReadOnlyList<LibraryGameModule>>.Failure(permission.Error);
    }

    public async Task<Result<GameModule>> CreateAsync(
        string? title,
        GamificationGameType gameType,
        IReadOnlyList<GameQuestion>? questions,
        CancellationToken cancellationToken,
        GameContent? content = null)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<GameModule>.Failure(permission.Error);
        }

        var validated = Validate(title, gameType, questions, content);
        if (!validated.IsSuccess)
        {
            return Result<GameModule>.Failure(validated.Error);
        }

        var module = new GameModule(
            Guid.NewGuid(),
            validated.Value.Title,
            gameType,
            validated.Value.Questions,
            timeProvider.GetUtcNow(),
            content);
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await moduleStore.AddAsync(module, cancellationToken);
        await WriteAuditAsync("learning.game_module.created", "game_module", module.Id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<GameModule>.Success(module);
    }

    public async Task<Result<GameModule>> UpdateAsync(
        Guid moduleId,
        string? title,
        GamificationGameType gameType,
        IReadOnlyList<GameQuestion>? questions,
        CancellationToken cancellationToken,
        GameContent? content = null)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<GameModule>.Failure(permission.Error);
        }

        var validated = Validate(title, gameType, questions, content);
        if (!validated.IsSuccess)
        {
            return Result<GameModule>.Failure(validated.Error);
        }

        var existing = await moduleStore.FindAsync(moduleId, cancellationToken);
        if (existing is null)
        {
            return Failure<GameModule>(ModuleNotFoundCode, ModuleNotFoundMessage);
        }

        var module = existing with
        {
            Title = validated.Value.Title,
            GameType = gameType,
            Questions = validated.Value.Questions,
            Content = content
        };
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await moduleStore.UpdateAsync(module, cancellationToken);
        await WriteAuditAsync("learning.game_module.updated", "game_module", moduleId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<GameModule>.Success(module);
    }

    public async Task<Result<bool>> DeleteAsync(Guid moduleId, CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return permission;
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await moduleStore.DeleteAsync(moduleId, cancellationToken))
        {
            return Failure<bool>(ModuleNotFoundCode, ModuleNotFoundMessage);
        }

        await WriteAuditAsync("learning.game_module.deleted", "game_module", moduleId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    public async Task<Result<PlatformCourse>> SetCourseModulesAsync(
        Guid courseId,
        IReadOnlyList<CourseModulePlacement>? placements,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourse>.Failure(permission.Error);
        }

        var course = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        if (course is null)
        {
            return Failure<PlatformCourse>("learning.platform_course.not_found", "O curso não foi encontrado.");
        }

        if (placements is null || placements.Count > MaximumItems ||
            placements.Any(item => item.AfterVideoCount < 0 || item.AfterVideoCount > course.Videos.Count))
        {
            return Failure<PlatformCourse>(
                "learning.game_module.placement_invalid",
                "Cada módulo deve ser posicionado entre o início e o último vídeo do curso.");
        }

        if (!await moduleStore.AllExistAsync(placements.Select(item => item.ModuleId).Distinct().ToArray(), cancellationToken))
        {
            return Failure<PlatformCourse>(ModuleNotFoundCode, ModuleNotFoundMessage);
        }

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await moduleStore.SetCoursePlacementsAsync(courseId, placements, cancellationToken);
        await WriteAuditAsync("learning.platform_course.modules_changed", "platform_course", courseId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var refreshed = await catalogStore.FindCourseAsync(courseId, cancellationToken);
        return refreshed is null
            ? Failure<PlatformCourse>("learning.platform_course.not_found", "O curso não foi encontrado.")
            : Result<PlatformCourse>.Success(refreshed);
    }

    public async Task<Result<PlatformCourseVideo>> SetVideoCheckpointsAsync(
        Guid videoId,
        IReadOnlyList<VideoCheckpoint>? checkpoints,
        CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess)
        {
            return Result<PlatformCourseVideo>.Failure(permission.Error);
        }

        var video = await catalogStore.FindVideoAsync(videoId, cancellationToken);
        if (video is null)
        {
            return Failure<PlatformCourseVideo>(
                "learning.platform_course.video_not_found",
                "O vídeo não foi encontrado.");
        }

        if (checkpoints is null || checkpoints.Count > MaximumItems ||
            checkpoints.Any(item => item.TimeMilliseconds < 1 || item.TimeMilliseconds > video.DurationMilliseconds))
        {
            return Failure<PlatformCourseVideo>(
                "learning.game_module.checkpoint_invalid",
                "Cada parada deve estar entre o início e o fim do vídeo.");
        }

        if (!await moduleStore.AllExistAsync(checkpoints.Select(item => item.ModuleId).Distinct().ToArray(), cancellationToken))
        {
            return Failure<PlatformCourseVideo>(ModuleNotFoundCode, ModuleNotFoundMessage);
        }

        var ordered = checkpoints.OrderBy(item => item.TimeMilliseconds).ToArray();
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await moduleStore.SetVideoCheckpointsAsync(videoId, ordered, cancellationToken);
        await WriteAuditAsync("learning.platform_course.video_checkpoints_changed", "platform_course_video", videoId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<PlatformCourseVideo>.Success(video with { Checkpoints = ordered });
    }

    private const string ModuleNotFoundCode = "learning.game_module.not_found";
    private const string ModuleNotFoundMessage = "O módulo de jogo não foi encontrado.";

    private static Result<(string Title, IReadOnlyList<GameQuestion> Questions)> Validate(
        string? title,
        GamificationGameType gameType,
        IReadOnlyList<GameQuestion>? questions,
        GameContent? content)
    {
        var normalizedTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > 200)
        {
            return Failure<(string, IReadOnlyList<GameQuestion>)>(
                "learning.game_module.title_invalid",
                "O nome do módulo deve ter entre 1 e 200 caracteres.");
        }

        if (!Enum.IsDefined(gameType))
        {
            return Failure<(string, IReadOnlyList<GameQuestion>)>(
                "learning.platform_course.game_type_invalid",
                "O tipo de jogo informado é inválido.");
        }

        var cleaned = new List<GameQuestion>();
        foreach (var question in questions ?? [])
        {
            var text = question.Text?.Trim();
            var options = (question.Options ?? []).Select(option => option?.Trim() ?? string.Empty).ToArray();
            if (string.IsNullOrWhiteSpace(text) || text.Length > 500 ||
                options.Length is < 2 or > MaximumOptions ||
                options.Any(option => option.Length is 0 or > 200) ||
                question.CorrectIndex < 0 || question.CorrectIndex >= options.Length)
            {
                return Failure<(string, IReadOnlyList<GameQuestion>)>(
                    "learning.game_module.question_invalid",
                    "Cada pergunta precisa de texto, de 2 a 6 alternativas e uma resposta correta válida.");
            }

            cleaned.Add(new GameQuestion(text, options, question.CorrectIndex));
        }

        if (cleaned.Count > MaximumQuestions ||
            (gameType is GamificationGameType.Quiz or GamificationGameType.Scenario && cleaned.Count == 0))
        {
            return Failure<(string, IReadOnlyList<GameQuestion>)>(
                "learning.game_module.questions_invalid",
                "Um Quiz precisa de 1 a 50 perguntas.");
        }

        if (gameType is not (GamificationGameType.Quiz or GamificationGameType.Scenario) &&
            !IsContentValid(gameType, content))
        {
            return Failure<(string, IReadOnlyList<GameQuestion>)>(
                "learning.game_module.content_invalid",
                "Preencha o conteúdo do jogo: imagem e riscos, imagem e grade, pares, sequência de 2 a 12 itens ou de 3 a 20 cartas.");
        }

        return Result<(string, IReadOnlyList<GameQuestion>)>.Success((normalizedTitle, cleaned));
    }

    private static bool IsContentValid(GamificationGameType type, GameContent? content)
    {
        if (content is null) return false;
        static bool Text(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 200;
        var image = content.ImageUrl;
        var validImage = image is { Length: > 0 and <= 2000 } &&
            ((image.StartsWith('/') && !image.StartsWith("//") && !image.Contains('\\')) ||
             (Uri.TryCreate(image, UriKind.Absolute, out var uri) && uri.Scheme == "https"));
        return type switch
        {
            GamificationGameType.Puzzle => validImage && content.Columns is >= 2 and <= 3,
            GamificationGameType.Memory => content.Pairs is { Count: >= 2 and <= 12 } pairs &&
                pairs.All(pair => pair is not null && Text(pair.First) && Text(pair.Second)),
            GamificationGameType.Ordering => content.Items is { Count: >= 2 and <= 12 } items &&
                items.All(Text) && items.Distinct(StringComparer.Ordinal).Count() == items.Count,
            GamificationGameType.RiskSpotting => validImage && content.Risks is { Count: >= 1 and <= 12 } risks &&
                risks.All(risk => risk is not null && Text(risk.Label) &&
                    risk.X >= 0 && risk.Y >= 0 && risk.Width > 0 && risk.Height > 0 &&
                    risk.X + risk.Width <= 100 && risk.Y + risk.Height <= 100),
            GamificationGameType.SafeOrRisky => content.Cards is { Count: >= 3 and <= 20 } cards &&
                cards.All(card => card is not null && Text(card.Text) && (card.Explanation is null || card.Explanation.Length <= 300)),
            _ => false
        };
    }

    private Task WriteAuditAsync(string action, string entityType, Guid entityId, CancellationToken cancellationToken) =>
        auditTrail.WriteAsync(
            new AuditRecord(
                currentActor.UserId!,
                null,
                action,
                entityType,
                entityId.ToString("D"),
                timeProvider.GetUtcNow()),
            cancellationToken);

    private Result<bool> EnsurePlatformOperator() =>
        currentActor.IsInRole(PlatformRoles.PlatformOperator) &&
        tenantContext.CurrentTenantId is null
            ? Result<bool>.Success(true)
            : Result<bool>.Failure(new DomainError(
                "learning.platform_course.forbidden",
                "Somente a operação global pode gerenciar o catálogo de cursos."));

    private static Result<T> Failure<T>(string code, string message)
        where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
