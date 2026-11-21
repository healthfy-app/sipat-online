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
                user.TenantId is not { } userTenantId ||
                tenantContext.CurrentTenantId?.Value != userTenantId)
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
            UserApplicationService userService,
            LoginAttemptLimiter limiter,
            CancellationToken cancellationToken) =>
        {
            if (!limiter.TryAcquire(context, request.LoginIdentifier))
            {
                return LoginAttemptLimiter.TooManyAttempts();
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
                    detail: "Login ou senha inválida.");
            }

            return Results.NoContent();
        })
        .AllowAnonymous()
        .RequireRateLimiting("identity-auth")
        .WithName("SignIn");

        group.MapPost("/logout", async (
            HttpContext context,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            await userService.SignOutAsync(cancellationToken);
            return Results.NoContent();
        })
        .RequireAuthorization()
        .WithName("SignOut");

        return endpoints;
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
