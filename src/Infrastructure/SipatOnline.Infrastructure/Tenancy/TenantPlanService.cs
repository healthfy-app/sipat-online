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
