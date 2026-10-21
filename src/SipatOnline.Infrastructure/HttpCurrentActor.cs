using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using SipatOnline.BuildingBlocks.Application;

namespace SipatOnline.Infrastructure;

public sealed class HttpCurrentActor(IHttpContextAccessor httpContextAccessor) : ICurrentActor
{
    private ClaimsPrincipal? User => httpContextAccessor.HttpContext?.User;

    public string? UserId => User?.FindFirstValue(ClaimTypes.NameIdentifier);

    public bool IsInRole(string role) => User?.IsInRole(role) is true;
}
