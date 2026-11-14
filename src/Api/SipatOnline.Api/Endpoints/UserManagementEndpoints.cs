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

        group.MapGet("/", async (
            int? offset,
            int? limit,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            var result = await userService.ListAsync(
                new ListUsersRequest(offset ?? 0, limit ?? 50),
                cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            var page = result.Value;
            return Results.Ok(new UserListResponse(
                page.Offset,
                page.Limit,
                page.TotalCount,
                page.Items.Select(ToResponse).ToArray()));
        })
        .WithName("ListUsers");

        endpoints.MapGet("/api/admin/users/participants", async (
            int? offset,
            int? limit,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            var result = await userService.ListParticipantsAsync(
                new ListUsersRequest(offset ?? 0, limit ?? 50),
                cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            var page = result.Value;
            return Results.Ok(new UserListResponse(
                page.Offset,
                page.Limit,
                page.TotalCount,
                page.Items.Select(ToResponse).ToArray()));
        })
        .RequireAuthorization("ViewTenantLearning")
        .WithName("ListParticipants");

        group.MapPost("/", async (
            ProvisionUserRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            UserApplicationService userService,
            SipatOnline.Infrastructure.Learning.LearningDistributionService distribution,
            SipatOnline.BuildingBlocks.Application.ITenantContext tenantContext,
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
            // someone who arrives while a SIPAT is live starts with its days already there
            if (request.Role == SipatOnline.BuildingBlocks.Application.PlatformRoles.Participant && tenantContext.CurrentTenantId is { IsEmpty: false } tenant)
            {
                await distribution.EnsureAssignmentsAsync(tenant.Value, user.Id.Value, cancellationToken);
            }

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

        group.MapPut("/{userId:guid}/login", async (
            Guid userId,
            ChangeLoginRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatOnline.Infrastructure.Identity.EmployeeCredentialService credentials,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await credentials.ChangeLoginAsync(userId, request.LoginIdentifier, cancellationToken);
            return result.IsSuccess ? Results.Ok(new { loginIdentifier = result.Value }) : ToProblem(result.Error);
        })
        .WithName("ChangeEmployeeLogin");

        group.MapPut("/{userId:guid}/password", async (
            Guid userId,
            ResetPasswordRequest request,
            HttpContext context,
            IAntiforgery antiforgery,
            SipatOnline.Infrastructure.Identity.EmployeeCredentialService credentials,
            CancellationToken cancellationToken) =>
        {
            var antiforgeryResult = await ValidateAntiforgeryAsync(antiforgery, context);
            if (antiforgeryResult is not null)
            {
                return antiforgeryResult;
            }

            var result = await credentials.ResetPasswordAsync(userId, request.NewPassword, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("ResetEmployeePassword");

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

public sealed record UserListResponse(
    int Offset,
    int Limit,
    int TotalCount,
    IReadOnlyList<UserResponse> Items);

public sealed record ChangeLoginRequest(string? LoginIdentifier);

public sealed record ResetPasswordRequest(string? NewPassword);
