using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>The days of a SIPAT, kept with it: one row per SIPAT, read and written whole.</summary>
public sealed class SipatPlanEntity
{
    public Guid SipatEventId { get; set; }

    public Guid TenantId { get; set; }

    public string DaysJson { get; set; } = "[]";

    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class SipatPlanEntityConfiguration : Microsoft.EntityFrameworkCore.IEntityTypeConfiguration<SipatPlanEntity>
{
    public void Configure(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<SipatPlanEntity> builder)
    {
        builder.ToTable("SipatPlans", "learning");
        builder.HasKey(plan => plan.SipatEventId);
        builder.Property(plan => plan.SipatEventId).ValueGeneratedNever();
        builder.Property(plan => plan.TenantId).IsRequired();
        builder.Property(plan => plan.DaysJson).IsRequired();
        builder.Property(plan => plan.UpdatedAt).IsRequired();
        builder.HasIndex(plan => plan.TenantId);
    }
}

public sealed record SipatPlanSummary(Guid SipatEventId, int Days, int Videos);

/// <summary>
/// A company's SIPAT is one week of training: a start date, some days, and a theme (videos and games) for each day.
/// It is built as a draft, then launched: that publishes it (only one SIPAT is published at a time) and delivers
/// each day to the participants as a track. The company's administrator and the operator use the same service.
/// </summary>
public sealed class SipatPlanService(
    PlatformDbContext db,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IPlatformCourseCatalogStore catalog,
    IGameModuleStore games,
    LearningDistributionService distribution,
    SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
    IAuditTrail audit,
    TimeProvider clock)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<Result<IReadOnlyList<ProgramDay>>> GetAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        var plan = await db.SipatPlans.AsNoTracking().SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        return Result<IReadOnlyList<ProgramDay>>.Success(plan is null ? [] : Read(plan));
    }

    public async Task<Result<IReadOnlyList<SipatPlanSummary>>> SummariesAsync(CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<IReadOnlyList<SipatPlanSummary>>.Failure(tenant.Error);
        var plans = await db.SipatPlans.AsNoTracking().Where(item => item.TenantId == tenant.Value).ToListAsync(token);
        return Result<IReadOnlyList<SipatPlanSummary>>.Success(plans
            .Select(plan => { var days = Read(plan); return new SipatPlanSummary(plan.SipatEventId, days.Count, days.Sum(day => day.VideoIds.Count)); })
            .ToArray());
    }

    /// <summary>Saves the days. The SIPAT's dates follow the dates of its days, so a week is always what the table says.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> SaveAsync(Guid sipatId, IReadOnlyList<ProgramDay>? days, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<IReadOnlyList<ProgramDay>>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.cancelled", "Esta SIPAT foi cancelada e não pode mais ser alterada.");

        var capabilities = await plans.CapabilitiesAsync(token);
        // the quiz at the end of each module is part of the top plan only
        if (!capabilities.Quizzes && days is not null)
            days = days.Select(day => day with { GameIds = [] }).ToArray();

        var cleaned = await ProgramDayRules.CleanAsync(days, catalog, games, token);
        if (!cleaned.IsSuccess) return cleaned;

        if (!capabilities.CustomizeGrid)
        {
            // without personalization every day is one of the ready grades: the videos of a ready theme, as they are
            var ready = (await catalog.ListAsync(token))
                .Where(course => course.Status == PlatformCourseStatus.Published && SipatOnline.Infrastructure.Tenancy.CompanyPlans.IsReadyTheme(course.Description))
                .Select(course => course.Videos.Select(video => video.Id).ToArray())
                .ToList();
            var outside = cleaned.Value.FirstOrDefault(day => !ready.Any(videos => videos.SequenceEqual(day.VideoIds)));
            if (outside is not null)
                return Failure<IReadOnlyList<ProgramDay>>("sipat.grid_not_allowed", $"O dia \"{outside.Title}\" não usa uma das grades prontas. Escolha os temas das opções de grade disponíveis.");
        }

        var now = clock.GetUtcNow();
        var plan = await db.SipatPlans.SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        if (plan is null)
        {
            plan = new SipatPlanEntity { SipatEventId = sipatId, TenantId = sipat.TenantId };
            db.SipatPlans.Add(plan);
        }

        plan.DaysJson = JsonSerializer.Serialize(cleaned.Value, JsonOptions);
        plan.UpdatedAt = now;

        var dates = cleaned.Value.Where(day => day.Date is not null).Select(day => day.Date!.Value).ToArray();
        if (dates.Length > 0)
        {
            sipat.StartsAt = new DateTimeOffset(dates.Min().ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
            sipat.EndsAt = new DateTimeOffset(dates.Max().AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        }

        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.plan.saved", "sipat_event",
            sipatId.ToString("D"), now), token);
        return cleaned;
    }

    /// <summary>Starts the SIPAT from the days of another one (same company): new days, same videos and games, dates left to the new start date.</summary>
    public async Task<Result<IReadOnlyList<ProgramDay>>> CopyAsync(Guid sipatId, Guid sourceId, CancellationToken token)
    {
        var source = await GetAsync(sourceId, token);
        if (!source.IsSuccess) return source;
        if (source.Value.Count == 0)
            return Failure<IReadOnlyList<ProgramDay>>("sipat.plan_empty", "A SIPAT escolhida ainda não tem dias montados.");
        var copy = source.Value
            .Select(day => day with { Id = Guid.NewGuid(), Date = null })
            .ToArray();
        return await SaveAsync(sipatId, copy, token);
    }

    /// <summary>Publishes the SIPAT and delivers its days. Only one SIPAT of a company is published at a time.</summary>
    public async Task<Result<ProgramApplication>> LaunchAsync(Guid sipatId, CancellationToken token)
    {
        var found = await FindEventAsync(sipatId, token);
        if (!found.IsSuccess) return Result<ProgramApplication>.Failure(found.Error);
        var sipat = found.Value;
        if (sipat.Status == SipatEventStatus.Cancelled)
            return Failure<ProgramApplication>("sipat.cancelled", "Esta SIPAT foi cancelada e não pode ser publicada.");

        var plan = await db.SipatPlans.AsNoTracking().SingleOrDefaultAsync(item => item.SipatEventId == sipatId, token);
        var days = plan is null ? [] : Read(plan);
        if (days.Count == 0)
            return Failure<ProgramApplication>("sipat.plan_empty", "Monte os dias da SIPAT antes de publicar.");

        if (sipat.Status != SipatEventStatus.Published)
        {
            var other = await db.SipatEvents.AsNoTracking()
                .Where(item => item.TenantId == sipat.TenantId && item.Id != sipatId && item.Status == SipatEventStatus.Published)
                .Select(item => item.Title).FirstOrDefaultAsync(token);
            if (other is not null)
                return Failure<ProgramApplication>("sipat.already_published", $"Já existe uma SIPAT publicada: \"{other}\". Cancele-a antes de publicar outra.");
            sipat.Status = SipatEventStatus.Published;
            await db.SaveChangesAsync(token);
            await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(sipat.TenantId), "sipat.published", "sipat_event",
                sipatId.ToString("D"), clock.GetUtcNow()), token);
        }

        return await distribution.ApplyDaysAsync(sipat.TenantId, sipatId, days, sipatId, "learning.sipat.launched", "sipat_event", token);
    }

    private Result<Guid> Tenant() =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? Result<Guid>.Success(tenant.Value)
            : Failure<Guid>("tenant.context.required", "Não foi possível identificar a empresa.");

    private async Task<Result<SipatEventEntity>> FindEventAsync(Guid sipatId, CancellationToken token)
    {
        var tenant = Tenant();
        if (!tenant.IsSuccess) return Result<SipatEventEntity>.Failure(tenant.Error);
        var sipat = await db.SipatEvents.SingleOrDefaultAsync(item => item.Id == sipatId && item.TenantId == tenant.Value, token);
        return sipat is null
            ? Failure<SipatEventEntity>("sipat.not_found", "A SIPAT não foi encontrada.")
            : Result<SipatEventEntity>.Success(sipat);
    }

    private static IReadOnlyList<ProgramDay> Read(SipatPlanEntity plan) =>
        (JsonSerializer.Deserialize<IReadOnlyList<ProgramDay>>(plan.DaysJson, JsonOptions) ?? [])
            .Select(day => day with { VideoIds = day.VideoIds ?? [], GameIds = day.GameIds ?? [] })
            .ToArray();

    private static Result<T> Failure<T>(string code, string message) where T : notnull =>
        Result<T>.Failure(new DomainError(code, message));
}
