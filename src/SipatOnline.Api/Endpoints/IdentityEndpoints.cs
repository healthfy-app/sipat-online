using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Infrastructure.Identity;

namespace SipatOnline.Api.Endpoints;

public static class IdentityEndpoints
{
    public static IEndpointRouteBuilder MapIdentityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/identity")
            .WithTags("Identity");

        group.MapGet("/antiforgery", (IAntiforgery antiforgery, HttpContext context) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new AntiforgeryTokenResponse(tokens.RequestToken));
        })
        .AllowAnonymous()
        .WithName("GetAntiforgeryToken");

        group.MapGet("/session", async (
            HttpContext context,
            UserManager<PlatformIdentityUser> userManager,
            ITenantContext tenantContext) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userId, out var id))
            {
                return Results.Unauthorized();
            }

            var user = await userManager.FindByIdAsync(id.ToString("D"));
            if (user is null ||
                !user.IsActive ||
                tenantContext.CurrentTenantId?.Value != user.TenantId)
            {
                return Results.Unauthorized();
            }

            var roles = await userManager.GetRolesAsync(user);
            return Results.Ok(new IdentitySessionResponse(
                user.Id,
                user.EmployeeIdentifier,
                user.DisplayName,
                roles.ToArray()));
        })
        .RequireAuthorization()
        .WithName("GetIdentitySession");

        group.MapPost("/login", async (
            LoginRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await userService.SignInAsync(
                request.LoginIdentifier,
                request.Password,
                cancellationToken);
            if (!result.IsSuccess || !result.Value)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status401Unauthorized,
                    title: "Não foi possível autenticar.",
                    detail: "Matrícula ou senha inválida.");
            }

            return Results.NoContent();
        })
        .AllowAnonymous()
        .RequireRateLimiting("identity-auth")
        .WithName("SignIn");

        group.MapPost("/logout", async (
            HttpContext context,
            IAntiforgery antiforgery,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            await userService.SignOutAsync(cancellationToken);
            return Results.NoContent();
        })
        .RequireAuthorization()
        .WithName("SignOut");

        return endpoints;
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

public sealed record LoginRequest(string? LoginIdentifier, string? Password);

public sealed record AntiforgeryTokenResponse(string? RequestToken);

public sealed record IdentitySessionResponse(
    Guid Id,
    string LoginIdentifier,
    string DisplayName,
    IReadOnlyList<string> Roles);

public sealed record UserResponse(
    Guid Id,
    string LoginIdentifier,
    string DisplayName,
    bool IsActive);

public sealed record ChangeUserStatusRequest(bool IsActive);
