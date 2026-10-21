using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;
using SipatOnline.Sipats.Application.Sipats;

namespace SipatOnline.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    public static IServiceCollection AddSipatInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddOptions<TenantRuntimeOptions>()
            .Bind(configuration.GetSection(TenantRuntimeOptions.SectionName))
            .Validate(options => options.Id != Guid.Empty, "A valid tenant ID must be configured.")
            .Validate(options => TenantKey.Create(options.Key).IsSuccess, "A valid tenant key must be configured.")
            .Validate(options => !string.IsNullOrWhiteSpace(options.Name), "A tenant name must be configured.")
            .Validate(
                options => !string.IsNullOrWhiteSpace(options.BaseDomain) &&
                           Uri.CheckHostName(options.BaseDomain.Trim().TrimEnd('.')) == UriHostNameType.Dns,
                "A valid tenant base domain must be configured.")
            .ValidateOnStart();

        services.AddOptions<BootstrapAdminOptions>()
            .Bind(configuration.GetSection(BootstrapAdminOptions.SectionName))
            .Validate(
                options =>
                {
                    var hasLogin = !string.IsNullOrWhiteSpace(options.LoginIdentifier);
                    var hasName = !string.IsNullOrWhiteSpace(options.DisplayName);
                    var hasPassword = !string.IsNullOrEmpty(options.Password);
                    return (!hasLogin && !hasName && !hasPassword) || (hasLogin && hasName && hasPassword);
                },
                "Bootstrap admin login, display name, and password must be configured together.")
            .ValidateOnStart();

        services.AddDbContext<PlatformDbContext>((serviceProvider, options) =>
        {
            var connectionString = serviceProvider
                .GetRequiredService<IConfiguration>()
                .GetConnectionString("SipatOnline");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "ConnectionStrings:SipatOnline must be configured with User Secrets or an environment variable.");
            }

            options.UseNpgsql(
                connectionString,
                npgsql => npgsql.MigrationsAssembly(typeof(PlatformDbContext).Assembly.FullName));
        });

        services.AddIdentity<PlatformIdentityUser, IdentityRole<Guid>>(options =>
            {
                options.User.RequireUniqueEmail = false;
                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = false;
                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddEntityFrameworkStores<PlatformDbContext>()
            .AddDefaultTokenProviders();
        services.AddScoped<IUserClaimsPrincipalFactory<PlatformIdentityUser>, TenantClaimsPrincipalFactory>();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "__Host-SipatOnline.Auth";
            options.Cookie.Path = "/";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.SlidingExpiration = true;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddAuthorization(options =>
        {
            options.AddPolicy(
                "ManageTenantUsers",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin));
            options.AddPolicy(
                "ManageTenantBranding",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin));
            options.AddPolicy(
                "ManageTenantSipats",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin));
        });

        services.AddHttpContextAccessor();
        services.AddSingleton<TimeProvider>(TimeProvider.System);
        services.AddScoped<RequestTenantContext>();
        services.AddScoped<ITenantContext>(provider => provider.GetRequiredService<RequestTenantContext>());
        services.AddScoped<IRequestTenantContext>(provider => provider.GetRequiredService<RequestTenantContext>());
        services.AddScoped<ICurrentActor, HttpCurrentActor>();
        services.AddScoped<IUserAccountStore, EfUserAccountStore>();
        services.AddScoped<IUserSignInService, AspNetUserSignInService>();
        services.AddScoped<ISipatEventStore, EfSipatEventStore>();
        services.AddScoped<ITenantStore, EfTenantStore>();
        services.AddScoped<IApplicationUnitOfWork, EfApplicationUnitOfWork>();
        services.AddScoped<IAuditTrail, EfAuditTrail>();
        services.AddScoped<UserApplicationService>();
        services.AddScoped<SipatEventApplicationService>();
        services.AddScoped<TenantBrandingService>();
        services.AddScoped<DatabaseInitializer>();
        services.AddScoped<IValidator<ProvisionUserRequest>, ProvisionUserRequestValidator>();
        services.AddScoped<IValidator<ListUsersRequest>, ListUsersRequestValidator>();
        services.AddScoped<IValidator<SipatEventDataRequest>, SipatEventDataRequestValidator>();
        services.AddScoped<IValidator<ListSipatEventsRequest>, ListSipatEventsRequestValidator>();
        services.AddScoped<IValidator<UpdateTenantBrandingRequest>, UpdateTenantBrandingRequestValidator>();

        return services;
    }
}
