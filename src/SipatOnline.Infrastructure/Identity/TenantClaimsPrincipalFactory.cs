using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace SipatOnline.Infrastructure.Identity;

public sealed class TenantClaimsPrincipalFactory(
    UserManager<PlatformIdentityUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<PlatformIdentityUser, IdentityRole<Guid>>(
        userManager,
        roleManager,
        options)
{
    public const string TenantIdClaimType = "sipat:tenant_id";

    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(PlatformIdentityUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        identity.AddClaim(new Claim(TenantIdClaimType, user.TenantId.ToString("D")));
        return identity;
    }
}
