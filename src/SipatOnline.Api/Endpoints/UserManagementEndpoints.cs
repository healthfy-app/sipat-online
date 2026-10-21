using Microsoft.AspNetCore.Antiforgery;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Api.Endpoints;

public static class UserManagementEndpoints
{
    public static IEndpointRouteBuilder MapUserManagementEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/users")
            .WithTags("User management")
            .RequireAuthorization("ManageTenantUsers");

        group.MapPost("/", async (
            ProvisionUserRequest request,
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

            var result = await userService.ProvisionAsync(request, cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            var user = result.Value;
            var response = ToResponse(user);
            return Results.Created($"/api/admin/users/{user.Id.Value:D}", response);
        })
        .WithName("ProvisionUser");

        group.MapPut("/{userId:guid}/display-name", async (
            Guid userId,
            ChangeDisplayNameRequest request,
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

            var result = await userService.RenameAsync(
                new UserId(userId),
                request.DisplayName,
                cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("RenameUser");

        group.MapPut("/{userId:guid}/status", async (
            Guid userId,
            ChangeUserStatusRequest request,
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

            var result = await userService.ChangeActiveStatusAsync(
                new UserId(userId),
                request.IsActive,
                cancellationToken);
            return result.IsSuccess
                ? Results.Ok(ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("ChangeUserStatus");

        return endpoints;
    }

    private static UserResponse ToResponse(User user) =>
        new(
            user.Id.Value,
            user.LoginIdentifier.Value,
            user.DisplayName.Value,
            user.IsActive);

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "identity.forbidden" or "identity.role.assignment_forbidden" => StatusCodes.Status403Forbidden,
            "user.not_found" => StatusCodes.Status404NotFound,
            "identity.login_identifier.duplicate" => StatusCodes.Status409Conflict,
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

public sealed record ChangeDisplayNameRequest(string? DisplayName);
