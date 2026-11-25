using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure.Tenancy;

namespace SipatOnline.Api.Endpoints;

/// <summary>
/// Who may change a company's trainings. On a plan that does not personalize the grid (Bronze) the company only views:
/// the operation builds its training from a ready SIPAT and publishes it. Every other plan builds its own.
/// </summary>
public static class TrainingEditing
{
    public const string ViewOnlyCode = "sipat.view_only";

    public static async ValueTask<object?> RequireEditor(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var services = context.HttpContext.RequestServices;
        if (services.GetRequiredService<ICurrentActor>().IsInRole(PlatformRoles.PlatformOperator)) return await next(context);
        var capabilities = await services.GetRequiredService<TenantPlanService>().CapabilitiesAsync(context.HttpContext.RequestAborted);
        if (capabilities.CustomizeGrid) return await next(context);
        return Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: ViewOnlyCode,
            detail: "No seu plano o treinamento é montado pela operação e você acompanha por aqui. Montar o próprio treinamento começa no plano Prata.",
            extensions: new Dictionary<string, object?> { ["code"] = ViewOnlyCode });
    }
}
