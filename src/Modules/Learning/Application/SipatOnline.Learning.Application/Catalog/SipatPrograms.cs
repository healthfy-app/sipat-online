using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

/// <summary>One day of a program: a free title ("Dia 1 · Segurança no chão de fábrica") and its courses, in order.</summary>
public sealed record ProgramDay(string Title, IReadOnlyList<Guid> CourseIds);

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
    IApplicationUnitOfWork unitOfWork,
    IAuditTrail auditTrail,
    TimeProvider timeProvider)
{
    public const int MaximumTitleLength = 200;
    public const int MaximumDayTitleLength = 120;
    public const int MaximumDays = 14;
    public const int MaximumCoursesPerDay = 20;

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

        if (days is null || days.Count is 0 or > MaximumDays)
            return Failure("learning.program.days_invalid", $"O programa precisa ter de 1 a {MaximumDays} dias.");

        var cleaned = new List<ProgramDay>(days.Count);
        var seen = new HashSet<Guid>();
        foreach (var day in days)
        {
            var dayTitle = day.Title?.Trim();
            if (string.IsNullOrWhiteSpace(dayTitle) || dayTitle.Length > MaximumDayTitleLength)
                return Failure("learning.program.day_title_invalid", "Cada dia precisa de um título de até 120 caracteres.");

            var courseIds = day.CourseIds ?? [];
            if (courseIds.Count is 0 or > MaximumCoursesPerDay)
                return Failure("learning.program.day_courses_invalid", $"O dia \"{dayTitle}\" precisa ter de 1 a {MaximumCoursesPerDay} cursos.");

            foreach (var courseId in courseIds)
            {
                if (!seen.Add(courseId))
                    return Failure("learning.program.course_repeated", "Um curso só pode aparecer uma vez no programa.");
                if (await catalogStore.FindCourseAsync(courseId, cancellationToken) is null)
                    return Failure("learning.program.course_not_found", "Um dos cursos escolhidos não existe mais.");
            }

            cleaned.Add(new ProgramDay(dayTitle, courseIds.ToArray()));
        }

        return Result<(string, IReadOnlyList<ProgramDay>)>.Success((normalizedTitle, cleaned));
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
