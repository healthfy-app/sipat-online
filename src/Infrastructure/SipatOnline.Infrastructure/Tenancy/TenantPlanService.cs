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
