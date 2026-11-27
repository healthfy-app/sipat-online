using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Api.Endpoints;

public static class CompanyRegistryEndpoints
{
    public static IEndpointRouteBuilder MapCompanyRegistryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/registry").WithTags("Company registry");

        group.MapGet("/", async (CompanyRegistryService registry, CancellationToken token) =>
        {
            var result = await registry.GetAsync(token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .RequireAuthorization("ViewTenantLearning")
        .WithName("GetCompanyRegistry");

        group.MapPost("/units", (AddRegistryItemsRequest request, CompanyRegistryService registry, CancellationToken token) =>
            AddAsync(RegistryKind.Unit, request, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("AddCompanyUnits");

        group.MapPost("/sectors", (AddRegistryItemsRequest request, CompanyRegistryService registry, CancellationToken token) =>
            AddAsync(RegistryKind.Sector, request, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("AddCompanySectors");

        group.MapPut("/units/{id:guid}", (Guid id, UpdateRegistryItemRequest request, CompanyRegistryService registry, CancellationToken token) =>
            UpdateAsync(RegistryKind.Unit, id, request, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("UpdateCompanyUnit");

        group.MapPut("/sectors/{id:guid}", (Guid id, UpdateRegistryItemRequest request, CompanyRegistryService registry, CancellationToken token) =>
            UpdateAsync(RegistryKind.Sector, id, request, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("UpdateCompanySector");

        group.MapDelete("/units/{id:guid}", (Guid id, CompanyRegistryService registry, CancellationToken token) =>
            RemoveAsync(RegistryKind.Unit, id, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("RemoveCompanyUnit");

        group.MapDelete("/sectors/{id:guid}", (Guid id, CompanyRegistryService registry, CancellationToken token) =>
            RemoveAsync(RegistryKind.Sector, id, registry, token))
            .RequireAuthorization("ManageTenantUsers")
            .WithName("RemoveCompanySector");

        // the sectors of one unit: made inside it, and taken out of it
        group.MapPost("/units/{id:guid}/sectors", async (Guid id, AddRegistryItemsRequest request, CompanyRegistryService registry, CancellationToken token) =>
        {
            var result = await registry.AddUnitSectorsAsync(id, request.Names, token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .RequireAuthorization("ManageTenantUsers")
        .WithName("AddUnitSectors");

        group.MapDelete("/units/{id:guid}/sectors/{sectorId:guid}", async (Guid id, Guid sectorId, CompanyRegistryService registry, CancellationToken token) =>
        {
            var result = await registry.RemoveUnitSectorAsync(id, sectorId, token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .RequireAuthorization("ManageTenantUsers")
        .WithName("RemoveUnitSector");

        group.MapPut("/rules", async (ProfileRules rules, CompanyRegistryService registry, CancellationToken token) =>
        {
            var result = await registry.SaveRulesAsync(rules, token);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .RequireAuthorization("ManageTenantUsers")
        .WithName("SaveProfileRules");

        return endpoints;
    }

    private static async Task<IResult> AddAsync(RegistryKind kind, AddRegistryItemsRequest request, CompanyRegistryService registry, CancellationToken token)
    {
        var result = await registry.AddAsync(kind, request.Names ?? [], token);
        return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
    }

    private static async Task<IResult> UpdateAsync(RegistryKind kind, Guid id, UpdateRegistryItemRequest request, CompanyRegistryService registry, CancellationToken token)
    {
        var result = await registry.UpdateAsync(kind, id, request.Name, request.IsActive, token);
        return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
    }

    private static async Task<IResult> RemoveAsync(RegistryKind kind, Guid id, CompanyRegistryService registry, CancellationToken token)
    {
        var result = await registry.RemoveAsync(kind, id, token);
        return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "identity.forbidden" => StatusCodes.Status403Forbidden,
            "registry.not_found" => StatusCodes.Status404NotFound,
            "registry.name.duplicate" or "registry.unit_sector.in_use" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }
}

public sealed record AddRegistryItemsRequest(string[]? Names);

public sealed record UpdateRegistryItemRequest(string? Name, bool? IsActive);
