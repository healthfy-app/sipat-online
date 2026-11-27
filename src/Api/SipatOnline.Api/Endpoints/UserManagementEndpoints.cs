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
            Guid? unitId,
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
            var result = await userService.ListParticipantsAsync(
                new ListUsersRequest(offset ?? 0, limit ?? 50, unitId),
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

        endpoints.MapGet("/api/admin/users/participants/profiles", async (
            Guid? unitId,
            SipatOnline.Infrastructure.Identity.ParticipantProfileService profiles,
            CancellationToken cancellationToken) =>
        {
            var result = await profiles.ListAsync(unitId, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .RequireAuthorization("ViewTenantLearning")
        .WithName("ListParticipantProfiles");

        group.MapPut("/{userId:guid}/profile", async (
            Guid userId,
            SipatOnline.Infrastructure.Identity.ChangeProfileRequest request,
            SipatOnline.Infrastructure.Identity.ParticipantProfileService profiles,
            CancellationToken cancellationToken) =>
        {
            var result = await profiles.ChangeAsync(userId, request, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ChangeParticipantProfile");

        group.MapPut("/placement", async (
            SipatOnline.Infrastructure.Identity.ChangePlacementRequest request,
            SipatOnline.Infrastructure.Identity.ParticipantProfileService profiles,
            CancellationToken cancellationToken) =>
        {
            var result = await profiles.ChangePlacementAsync(request, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ChangeParticipantsPlacement");

        group.MapPost("/", async (
            ProvisionUserRequest request,
            HttpContext context,
            UserApplicationService userService,
            SipatOnline.Infrastructure.Learning.LearningDistributionService distribution,
            SipatOnline.BuildingBlocks.Application.ITenantContext tenantContext,
            CancellationToken cancellationToken) =>
        {
            var result = await userService.ProvisionAsync(request, cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            var user = result.Value;
            // someone who arrives while a SIPAT is live starts with its days already there
            if (request.Role is SipatOnline.BuildingBlocks.Application.PlatformRoles.Participant or SipatOnline.BuildingBlocks.Application.PlatformRoles.ClientAdmin or SipatOnline.BuildingBlocks.Application.PlatformRoles.SuperAdmin && tenantContext.CurrentTenantId is { IsEmpty: false } tenant)
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
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
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
            UserApplicationService userService,
            CancellationToken cancellationToken) =>
        {
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
            SipatOnline.Infrastructure.Identity.EmployeeCredentialService credentials,
            CancellationToken cancellationToken) =>
        {
            var result = await credentials.ChangeLoginAsync(userId, request.LoginIdentifier, cancellationToken);
            return result.IsSuccess ? Results.Ok(new { loginIdentifier = result.Value }) : ToProblem(result.Error);
        })
        .WithName("ChangeEmployeeLogin");

        group.MapPut("/{userId:guid}/password", async (
            Guid userId,
            ResetPasswordRequest request,
            HttpContext context,
            SipatOnline.Infrastructure.Identity.EmployeeCredentialService credentials,
            CancellationToken cancellationToken) =>
        {
            var result = await credentials.ResetPasswordAsync(userId, request.NewPassword, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("ResetEmployeePassword");

        group.MapPost("/import", async (
            SipatOnline.Infrastructure.Identity.ImportRequest request,
            SipatOnline.Infrastructure.Identity.ParticipantImportService import,
            CancellationToken cancellationToken) =>
        {
            var result = await import.ImportAsync(request, cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value) : ToProblem(result.Error);
        })
        .WithName("ImportParticipants");

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
            "identity.login_identifier.duplicate" or "profile.registration.duplicate" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
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
