using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

/// <summary>
/// One day of a SIPAT program, as in the "Seletor de módulos" sheet: a title or slogan, an optional date,
/// a main subject, the videos picked for the day (in order) and the games, quizzes or forms.
/// <paramref name="Id"/> is stable across edits, so applying the program again finds the same day.
/// </summary>
public sealed record ProgramDay(
    Guid Id,
    string Title,
    DateOnly? Date,
    string? Subject,
    IReadOnlyList<Guid> VideoIds,
    IReadOnlyList<Guid> GameIds);

/// <summary>A SIPAT program built once by the operator and applied to any company's SIPAT.</summary>
public sealed record SipatProgram(Guid Id, string Title, IReadOnlyList<ProgramDay> Days, DateTimeOffset CreatedAt);

public interface ISipatProgramStore
{
    Task<IReadOnlyList<SipatProgram>> ListAsync(CancellationToken cancellationToken);

    Task<SipatProgram?> FindAsync(Guid programId, CancellationToken cancellationToken);

    Task AddAsync(SipatProgram program, CancellationToken cancellationToken);

    Task<bool> UpdateAsync(SipatProgram program, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(Guid programId, CancellationToken cancellationToken);
}

public sealed class SipatProgramService(
    ITenantContext tenantContext,
    ICurrentActor currentActor,
    ISipatProgramStore programStore,
    IPlatformCourseCatalogStore catalogStore,
    IGameModuleStore gameStore,
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    public const int MaximumTitleLength = 200;
    public const int MaximumDayTitleLength = 160;
    public const int MaximumSubjectLength = 120;
    public const int MaximumDays = 14;
    public const int MaximumVideosPerDay = 10;
    public const int MaximumGamesPerDay = 5;

    public async Task<Result<IReadOnlyList<SipatProgram>>> ListAsync(CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        return permission.IsSuccess
            ? Result<IReadOnlyList<SipatProgram>>.Success(await programStore.ListAsync(cancellationToken))
            : Result<IReadOnlyList<SipatProgram>>.Failure(permission.Error);
    }

    public async Task<Result<SipatProgram>> CreateAsync(
        string? title, IReadOnlyList<ProgramDay>? days, CancellationToken cancellationToken)
    {
        var validated = await ValidateAsync(title, days, cancellationToken);
        if (!validated.IsSuccess) return Result<SipatProgram>.Failure(validated.Error);

        var program = new SipatProgram(Guid.NewGuid(), validated.Value.Title, validated.Value.Days, timeProvider.GetUtcNow());
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        await programStore.AddAsync(program, cancellationToken);
        await WriteAuditAsync("learning.program.created", program.Id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<SipatProgram>.Success(program);
    }

    public async Task<Result<SipatProgram>> UpdateAsync(
        Guid programId, string? title, IReadOnlyList<ProgramDay>? days, CancellationToken cancellationToken)
    {
        var validated = await ValidateAsync(title, days, cancellationToken);
        if (!validated.IsSuccess) return Result<SipatProgram>.Failure(validated.Error);

        var existing = await programStore.FindAsync(programId, cancellationToken);
        if (existing is null) return NotFound<SipatProgram>();

        var program = existing with { Title = validated.Value.Title, Days = validated.Value.Days };
        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await programStore.UpdateAsync(program, cancellationToken)) return NotFound<SipatProgram>();
        await WriteAuditAsync("learning.program.updated", program.Id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<SipatProgram>.Success(program);
    }

    public async Task<Result<bool>> DeleteAsync(Guid programId, CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess) return permission;

        await using var transaction = await unitOfWork.BeginTransactionAsync(cancellationToken);
        if (!await programStore.DeleteAsync(programId, cancellationToken)) return NotFound<bool>();
        await WriteAuditAsync("learning.program.deleted", programId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    private async Task<Result<(string Title, IReadOnlyList<ProgramDay> Days)>> ValidateAsync(
        string? title, IReadOnlyList<ProgramDay>? days, CancellationToken cancellationToken)
    {
        var permission = EnsurePlatformOperator();
        if (!permission.IsSuccess) return Result<(string, IReadOnlyList<ProgramDay>)>.Failure(permission.Error);

        var normalizedTitle = title?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTitle) || normalizedTitle.Length > MaximumTitleLength)
            return Failure("learning.program.title_invalid", "O nome do programa deve ter entre 1 e 200 caracteres.");

        var cleaned = await ProgramDayRules.CleanAsync(days, catalogStore, gameStore, cancellationToken);
        if (!cleaned.IsSuccess) return Result<(string, IReadOnlyList<ProgramDay>)>.Failure(cleaned.Error);

        return Result<(string, IReadOnlyList<ProgramDay>)>.Success((normalizedTitle, cleaned.Value));
    }

    private Task WriteAuditAsync(string action, Guid programId, CancellationToken cancellationToken) =>
        auditTrail.WriteAsync(
            new AuditRecord(currentActor.UserId!, null, action, "sipat_program", programId.ToString("D"), timeProvider.GetUtcNow()),
            cancellationToken);

    private Result<bool> EnsurePlatformOperator() =>
        currentActor.IsInRole(PlatformRoles.PlatformOperator) && tenantContext.CurrentTenantId is null
            ? Result<bool>.Success(true)
            : Result<bool>.Failure(new DomainError(
                "learning.platform_course.forbidden",
                "Somente a operação global pode gerenciar o catálogo de cursos."));

    private static Result<(string, IReadOnlyList<ProgramDay>)> Failure(string code, string message) =>
        Result<(string, IReadOnlyList<ProgramDay>)>.Failure(new DomainError(code, message));

    private static Result<T> NotFound<T>() where T : notnull =>
        Result<T>.Failure(new DomainError("learning.program.not_found", "O programa não foi encontrado."));
}

/// <summary>What makes the days of a SIPAT valid: each has a title, from one to ten videos that exist, and games that exist.</summary>
public static class ProgramDayRules
{
    public static async Task<Result<IReadOnlyList<ProgramDay>>> CleanAsync(
        IReadOnlyList<ProgramDay>? days, IPlatformCourseCatalogStore catalogStore, IGameModuleStore gameStore, CancellationToken cancellationToken)
    {
        if (days is null || days.Count is 0 or > SipatProgramService.MaximumDays)
            return Fail("learning.program.days_invalid", $"A SIPAT precisa ter de 1 a {SipatProgramService.MaximumDays} dias.");

        var cleaned = new List<ProgramDay>(days.Count);
        foreach (var day in days)
        {
            var dayTitle = day.Title?.Trim();
            if (string.IsNullOrWhiteSpace(dayTitle) || dayTitle.Length > SipatProgramService.MaximumDayTitleLength)
                return Fail("learning.program.day_title_invalid", $"Cada dia precisa de um título de até {SipatProgramService.MaximumDayTitleLength} caracteres.");

            var subject = string.IsNullOrWhiteSpace(day.Subject) ? null : day.Subject.Trim();
            if (subject is { Length: > SipatProgramService.MaximumSubjectLength })
                return Fail("learning.program.subject_invalid", $"O assunto do dia \"{dayTitle}\" pode ter até {SipatProgramService.MaximumSubjectLength} caracteres.");

            var videoIds = day.VideoIds ?? [];
            if (videoIds.Count is 0 or > SipatProgramService.MaximumVideosPerDay)
                return Fail("learning.program.day_videos_invalid", $"O dia \"{dayTitle}\" precisa ter de 1 a {SipatProgramService.MaximumVideosPerDay} vídeos.");
            if (videoIds.Distinct().Count() != videoIds.Count)
                return Fail("learning.program.video_repeated", $"O dia \"{dayTitle}\" tem um vídeo repetido.");
            foreach (var videoId in videoIds)
            {
                if (await catalogStore.FindVideoAsync(videoId, cancellationToken) is null)
                    return Fail("learning.program.video_not_found", $"Um dos vídeos do dia \"{dayTitle}\" não existe mais.");
            }

            var gameIds = day.GameIds ?? [];
            if (gameIds.Count > SipatProgramService.MaximumGamesPerDay || gameIds.Distinct().Count() != gameIds.Count)
                return Fail("learning.program.day_games_invalid", $"O dia \"{dayTitle}\" pode ter até {SipatProgramService.MaximumGamesPerDay} jogos, sem repetir.");
            if (!await gameStore.AllExistAsync(gameIds.ToArray(), cancellationToken))
                return Fail("learning.program.game_not_found", $"Um dos jogos do dia \"{dayTitle}\" não existe mais.");

            // a day keeps its id across edits; a new day gets one here
            cleaned.Add(new ProgramDay(day.Id == Guid.Empty ? Guid.NewGuid() : day.Id, dayTitle, day.Date, subject, videoIds.ToArray(), gameIds.ToArray()));
        }

        if (cleaned.Select(day => day.Id).Distinct().Count() != cleaned.Count)
            return Fail("learning.program.day_repeated", "Dois dias do programa têm o mesmo identificador.");

        return Result<IReadOnlyList<ProgramDay>>.Success(cleaned);
    }

    private static Result<IReadOnlyList<ProgramDay>> Fail(string code, string message) =>
        Result<IReadOnlyList<ProgramDay>>.Failure(new DomainError(code, message));
}
