using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Tenancy.Application.Provisioning;

namespace SipatOnline.Api.Endpoints;

public static class PlatformEndpoints
{
    public static IEndpointRouteBuilder MapPlatformEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var platform = endpoints.MapGroup("/api/platform")
            .WithTags("Platform operations");

        var identity = platform.MapGroup("/identity")
            .WithTags("Platform identity");

        identity.MapPost("/login", async (
            LoginRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformOperatorAuthenticationService authenticationService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var signedIn = await authenticationService.SignInAsync(
                request.LoginIdentifier,
                request.Password,
                cancellationToken);
            return signedIn
                ? Results.NoContent()
                : Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Não foi possível autenticar.",
                    detail: "Matrícula ou senha inválida.");
        })
        .AllowAnonymous()
        .RequireRateLimiting("identity-auth")
        .WithName("SignInPlatformOperator");

        identity.MapGet("/session", async (
            HttpContext context,
            PlatformOperatorAuthenticationService authenticationService,
            CancellationToken cancellationToken) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userId, out var id))
            {
                return Results.Unauthorized();
            }

            var session = await authenticationService.GetSessionAsync(id, cancellationToken);
            return session is null ? Results.Unauthorized() : Results.Ok(session);
        })
        .RequireAuthorization("ManagePlatform")
        .WithName("GetPlatformOperatorSession");

        identity.MapPost("/logout", async (
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformOperatorAuthenticationService authenticationService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            await authenticationService.SignOutAsync(cancellationToken);
            return Results.NoContent();
        })
        .RequireAuthorization("ManagePlatform")
        .WithName("SignOutPlatformOperator");

        var companies = platform.MapGroup("/companies")
            .WithTags("Company provisioning")
            .RequireAuthorization("ManagePlatform");

        companies.MapGet("/", async (
            TenantProvisioningService tenantProvisioningService,
            CancellationToken cancellationToken) =>
        {
            var result = await tenantProvisioningService.ListAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .WithName("ListCompanies");

        companies.MapGet("/{tenantId:guid}/employees", async (
            Guid tenantId,
            string? search,
            bool? includeInactive,
            int? offset,
            int? limit,
            PlatformUserDirectoryService userDirectoryService,
            CancellationToken cancellationToken) =>
        {
            var result = await userDirectoryService.ListCompanyEmployeesAsync(
                tenantId,
                search,
                includeInactive ?? false,
                offset ?? 0,
                limit ?? 50,
                cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformCompanyEmployees");

        platform.MapGet("/dashboard", async (
            PlatformUserDirectoryService userDirectoryService,
            CancellationToken cancellationToken) =>
        {
            var result = await userDirectoryService.ListCompaniesAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .RequireAuthorization("ManagePlatform")
        .WithName("GetPlatformDashboard");

        companies.MapPost("/", async (
            CreateTenantRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            TenantProvisioningService tenantProvisioningService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await tenantProvisioningService.CreateAsync(request, cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/platform/companies/{result.Value.Id:D}", result.Value)
                : ToProblem(result.Error);
        })
        .WithName("ProvisionCompany");

        platform.MapGet("/users", async (
            int? offset,
            int? limit,
            Guid? tenantId,
            string? search,
            string? role,
            PlatformUserDirectoryService userDirectoryService,
            CancellationToken cancellationToken) =>
        {
            var result = await userDirectoryService.ListAsync(
                tenantId,
                search,
                role,
                offset ?? 0,
                limit ?? 50,
                cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value)
                : ToProblem(result.Error);
        })
        .RequireAuthorization("ManagePlatform")
        .WithName("ListPlatformUsers");

        platform.MapPost("/users", async (
            CreatePlatformUserRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            PlatformUserManagementService userManagementService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await userManagementService.ProvisionAsync(
                request.TenantId,
                new ProvisionUserRequest(
                    request.LoginIdentifier,
                    request.DisplayName,
                    request.InitialPassword,
                    request.Role),
                cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/platform/users/{result.Value.Id:D}", result.Value)
                : ToProblem(result.Error);
        })
        .RequireAuthorization("ManagePlatform")
        .WithName("ProvisionPlatformUser");

        return endpoints;
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "tenant.provisioning.forbidden" or
                "identity.platform_directory.forbidden" or
                "identity.platform_user.forbidden" or
                "identity.platform_user.role_forbidden" => StatusCodes.Status403Forbidden,
            "identity.platform_directory.pagination_invalid" => StatusCodes.Status400BadRequest,
            "identity.platform_directory.tenant_not_found" or
                "platform.user.tenant_not_found" => StatusCodes.Status404NotFound,
            "identity.platform_user.actor_required" => StatusCodes.Status400BadRequest,
            "platform.user.tenant_inactive" => StatusCodes.Status409Conflict,
            "tenant.key.duplicate" or "identity.login_identifier.duplicate" => StatusCodes.Status409Conflict,
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
}

public sealed record CreatePlatformUserRequest(
    Guid TenantId,
    string LoginIdentifier,
    string DisplayName,
    string InitialPassword,
    string Role);
