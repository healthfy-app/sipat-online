using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Infrastructure.Tenancy;

public sealed class TenantPlanService(PlatformDbContext db, ITenantContext tenantContext, ICurrentActor actor, IAuditTrail audit, TimeProvider clock)
{
    public async Task<CompanyPlan> GetAsync(Guid tenantId, CancellationToken token)
    {
        var plan = await db.Tenants.AsNoTracking().Where(item => item.Id == tenantId).Select(item => (int?)item.Plan).SingleOrDefaultAsync(token);
        return plan is { } value && Enum.IsDefined(typeof(CompanyPlan), value) ? (CompanyPlan)value : CompanyPlan.Bronze;
    }

    /// <summary>The plan of the company of the request (the administrator's, or the one the operator is working in).</summary>
    public async Task<CompanyPlan> CurrentAsync(CancellationToken token) =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant ? await GetAsync(tenant.Value, token) : CompanyPlan.Bronze;

    public async Task<CompanyCapabilities> CapabilitiesAsync(CancellationToken token) => CompanyCapabilities.For(await CurrentAsync(token));

    /// <summary>The assuntos a plan cannot use. Everything else in the catalog is available to it.</summary>
    public async Task<IReadOnlySet<Guid>> ExcludedSubjectsAsync(CompanyPlan plan, CancellationToken token) =>
        (await db.PlanSubjectExclusions.AsNoTracking().Where(item => item.Plan == (int)plan).Select(item => item.CourseId).ToListAsync(token)).ToHashSet();

    /// <summary>The assuntos that belong to one company (its internal videos), with the company of each.</summary>
    public async Task<IReadOnlyDictionary<Guid, Guid>> CompanySubjectsAsync(CancellationToken token) =>
        await db.CompanySubjects.AsNoTracking().ToDictionaryAsync(item => item.CourseId, item => item.TenantId, token);

    /// <summary>
    /// The assuntos a company cannot use: the ones its plan leaves out, the ones of other companies, and its own when its
    /// plan does not include internal videos. Its own assuntos are not subject to the plan's list: only to Diamante.
    /// </summary>
    public async Task<IReadOnlySet<Guid>> HiddenSubjectsAsync(Guid tenantId, CompanyPlan plan, CancellationToken token)
    {
        var owned = await CompanySubjectsAsync(token);
        var internalVideos = CompanyCapabilities.For(plan).InternalVideos;
        var hidden = (await ExcludedSubjectsAsync(plan, token)).Where(id => !owned.TryGetValue(id, out var owner) || owner != tenantId).ToHashSet();
        foreach (var (courseId, owner) in owned)
            if (owner != tenantId || !internalVideos) hidden.Add(courseId);
        return hidden;
    }

    /// <summary>What the company of the request cannot use (nothing when there is no company).</summary>
    public async Task<IReadOnlySet<Guid>> HiddenSubjectsAsync(CancellationToken token) =>
        tenantContext.CurrentTenantId is { IsEmpty: false } tenant
            ? await HiddenSubjectsAsync(tenant.Value, await GetAsync(tenant.Value, token), token)
            : new HashSet<Guid>();

    /// <summary>The videos made private to other companies (nothing when there is no company).</summary>
    public async Task<IReadOnlySet<Guid>> HiddenVideosAsync(CancellationToken token)
    {
        if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant) return new HashSet<Guid>();
        var rows = await db.CompanyVideos.AsNoTracking().ToListAsync(token);
        var hidden = rows.GroupBy(row => row.VideoId).Where(group => group.All(row => row.TenantId != tenant.Value)).Select(group => group.Key).ToHashSet();
        // a video a company sent is its own: nobody else's, and the company's only while its plan has internal videos
        var ownVideos = CompanyCapabilities.For(await GetAsync(tenant.Value, token)).InternalVideos;
        hidden.UnionWith(await db.PlatformCourseVideos.AsNoTracking()
            .Where(video => video.OwnerTenantId != null && (video.OwnerTenantId != tenant.Value || !ownVideos))
            .Select(video => video.Id).ToListAsync(token));
        return hidden;
    }

    /// <summary>The operator makes an assunto belong to one company (its internal videos), or gives it back to everyone.</summary>
    public async Task<Result<bool>> SetSubjectCompanyAsync(Guid courseId, Guid? tenantId, CancellationToken token)
    {
        if (!actor.IsInRole(PlatformRoles.PlatformOperator) || tenantContext.CurrentTenantId is not null)
            return Result<bool>.Failure(new DomainError("tenant.plan.forbidden", "Somente a operação pode decidir de qual empresa é um assunto."));
        if (!await db.PlatformCourses.AnyAsync(item => item.Id == courseId, token))
            return Result<bool>.Failure(new DomainError("tenant.subject.not_found", "O assunto não foi encontrado."));
        if (tenantId is { } company && !await db.Tenants.AnyAsync(item => item.Id == company, token))
            return Result<bool>.Failure(new DomainError("tenant.plan.not_found", "A empresa não foi encontrada."));
        var current = await db.CompanySubjects.SingleOrDefaultAsync(item => item.CourseId == courseId, token);
        if (tenantId is null && current is not null) db.CompanySubjects.Remove(current);
        else if (tenantId is { } owner && current is null) db.CompanySubjects.Add(new CompanySubjectEntity { CourseId = courseId, TenantId = owner });
        else if (tenantId is { } other && current is not null) current.TenantId = other;
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenantId is { } id ? new TenantId(id) : null, "plan.subject.company.changed", "course",
            courseId.ToString("D"), clock.GetUtcNow()), token);
        return Result<bool>.Success(true);
    }

    /// <summary>The operator decides which assuntos of the catalog a plan cannot use.</summary>
    public async Task<Result<bool>> SetExcludedSubjectsAsync(CompanyPlan plan, IReadOnlyCollection<Guid> courseIds, CancellationToken token)
    {
        if (!actor.IsInRole(PlatformRoles.PlatformOperator) || tenantContext.CurrentTenantId is not null)
            return Result<bool>.Failure(new DomainError("tenant.plan.forbidden", "Somente a operação pode alterar o que cada plano oferece."));
        var wanted = courseIds.Distinct().ToHashSet();
        var current = await db.PlanSubjectExclusions.Where(item => item.Plan == (int)plan).ToListAsync(token);
        db.PlanSubjectExclusions.RemoveRange(current.Where(item => !wanted.Contains(item.CourseId)));
        var known = current.Select(item => item.CourseId).ToHashSet();
        foreach (var id in wanted.Where(id => !known.Contains(id)))
            db.PlanSubjectExclusions.Add(new PlanSubjectExclusionEntity { Plan = (int)plan, CourseId = id });
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", null, "plan.subjects.changed", "plan", plan.ToString(), clock.GetUtcNow()), token);
        return Result<bool>.Success(true);
    }

    public async Task<Result<CompanyPlan>> SetAsync(Guid tenantId, CompanyPlan plan, CancellationToken token)
    {
        if (!actor.IsInRole(PlatformRoles.PlatformOperator) || tenantContext.CurrentTenantId is not null)
            return Result<CompanyPlan>.Failure(new DomainError("tenant.plan.forbidden", "Somente a operação pode alterar o plano de uma empresa."));
        var tenant = await db.Tenants.SingleOrDefaultAsync(item => item.Id == tenantId, token);
        if (tenant is null)
            return Result<CompanyPlan>.Failure(new DomainError("tenant.plan.not_found", "A empresa não foi encontrada."));
        tenant.Plan = (int)plan;
        await db.SaveChangesAsync(token);
        await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", new TenantId(tenantId), "tenant.plan.changed", "tenant",
            tenantId.ToString("D"), clock.GetUtcNow()), token);
        return Result<CompanyPlan>.Success(plan);
    }
}
