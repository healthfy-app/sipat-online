using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Provisioning;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Learning.Application;
using SipatOnline.Learning.Application.Catalog;

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
            .Validate(
                options => !string.IsNullOrWhiteSpace(options.PlatformHost) &&
                           Uri.CheckHostName(options.PlatformHost.Trim().TrimEnd('.')) == UriHostNameType.Dns &&
                           !string.Equals(
                               options.PlatformHost.Trim().TrimEnd('.'),
                               options.BaseDomain.Trim().TrimEnd('.'),
                               StringComparison.OrdinalIgnoreCase),
                "A platform host distinct from the tenant base domain must be configured.")
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

        services.AddOptions<PlatformOperatorOptions>()
            .Bind(configuration.GetSection(PlatformOperatorOptions.SectionName))
            .Validate(
                options =>
                {
                    var hasLogin = !string.IsNullOrWhiteSpace(options.LoginIdentifier);
                    var hasName = !string.IsNullOrWhiteSpace(options.DisplayName);
                    var hasPassword = !string.IsNullOrEmpty(options.Password);
                    return !hasPassword || (hasLogin && hasName);
                },
                "A platform operator password requires a login and display name.")
            .ValidateOnStart();

        services.AddOptions<DevelopmentSampleParticipantOptions>()
            .Bind(configuration.GetSection(DevelopmentSampleParticipantOptions.SectionName))
            .Validate(
                options =>
                {
                    var hasLogin = !string.IsNullOrWhiteSpace(options.LoginIdentifier);
                    var hasName = !string.IsNullOrWhiteSpace(options.DisplayName);
                    var hasPassword = !string.IsNullOrEmpty(options.Password);
                    return (!hasLogin && !hasName && !hasPassword) || (hasLogin && hasName && hasPassword);
                },
                "Development learning participant login, display name, and password must be configured together.")
            .ValidateOnStart();

        services.AddOptions<LearningProgressOptions>()
            .Bind(configuration.GetSection(LearningProgressOptions.SectionName))
            .Validate(
                options => options.CompletionThresholdPercent is >= 1 and <= 100,
                "Learning completion threshold must be between 1 and 100.")
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

            // PostgreSQL JIT adds ~250 ms to small catalog queries with join plans.
            var builder = new Npgsql.NpgsqlConnectionStringBuilder(connectionString);
            if (string.IsNullOrWhiteSpace(builder.Options))
            {
                builder.Options = "-c jit=off";
            }

            options.UseNpgsql(
                builder.ConnectionString,
                npgsql => npgsql.MigrationsAssembly(typeof(PlatformDbContext).Assembly.FullName));
        });

        services.AddIdentity<PlatformIdentityUser, IdentityRole<Guid>>(options =>
            {
                options.User.RequireUniqueEmail = false;
                // Senhas compartilhadas com operadores: a única regra é ter ao menos 6 caracteres.
                options.Password.RequiredLength = 6;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequiredUniqueChars = 1;
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
                "ManagePlatform",
                policy => policy.RequireRole(PlatformRoles.PlatformOperator));
            options.AddPolicy(
                "ManageTenantUsers",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin, PlatformRoles.PlatformOperator));
            options.AddPolicy(
                "ManageTenantBranding",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin, PlatformRoles.PlatformOperator));
            options.AddPolicy(
                "ManageTenantSipats",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin, PlatformRoles.PlatformOperator));
            options.AddPolicy(
                "ViewTenantLearning",
                policy => policy.RequireRole(PlatformRoles.SuperAdmin, PlatformRoles.ClientAdmin,
                    PlatformRoles.PlatformOperator, PlatformRoles.Supervisor));
            options.AddPolicy(
                "ParticipateInLearning",
                policy => policy.RequireRole(PlatformRoles.Participant));
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
        services.AddScoped<ILearningStore, EfLearningStore>();
        services.AddScoped<ILearningEngagementStore, EfLearningEngagementStore>();
        services.AddScoped<LearningEngagementService>();
        services.AddScoped<LearningDistributionService>();
        services.AddSingleton<ICertificatePdfRenderer, CertificatePdfRenderer>();
        services.AddScoped<IPlatformCourseCatalogStore, EfPlatformCourseCatalogStore>();
        services.AddScoped<PlatformCourseCatalogService>();
        services.AddSingleton<IPlatformCourseVideoStorage>(provider =>
            new FilePlatformCourseVideoStorage(
                configuration["SipatOnline:PlatformCatalog:StoragePath"],
                provider.GetRequiredService<IHostEnvironment>().IsDevelopment()));
        services.AddScoped<IPlatformCourseCatalogStore, EfPlatformCourseCatalogStore>();
        services.AddScoped<PlatformCourseCatalogService>();
        services.AddSingleton<IPlatformCourseVideoStorage>(provider =>
            new FilePlatformCourseVideoStorage(
                configuration["SipatOnline:PlatformCatalog:StoragePath"],
                provider.GetRequiredService<IHostEnvironment>().IsDevelopment()));
        services.AddScoped<IGameModuleStore, EfGameModuleStore>();
        services.AddScoped<GameModuleService>();
        services.AddScoped<DevelopmentLearningSampleInitializer>();
        services.AddScoped<DevelopmentDemoPresentationInitializer>();
        services.AddScoped<DevelopmentEngagementInitializer>();
        services.AddSingleton<DevelopmentSampleVideoProvider>();
        services.AddScoped<DevelopmentCatalogVideoProvider>();
        services.AddScoped<IVideoPlaybackProvider>(provider =>
            GetVideoPlaybackProvider(provider, configuration));
        services.AddScoped<IPlaybackEvidenceVerifier>(provider =>
            GetPlaybackEvidenceVerifier(provider, configuration));
        services.AddScoped<ITenantStore, EfTenantStore>();
        services.AddScoped<IInitialClientAdminProvisioner, EfInitialClientAdminProvisioner>();
        services.AddScoped<TenantProvisioningService>();
        services.AddScoped<PlatformOperatorAuthenticationService>();
        services.AddScoped<IPlatformUserDirectoryStore, EfPlatformUserDirectoryStore>();
        services.AddScoped<PlatformUserDirectoryService>();
        services.AddScoped<IPlatformUserManagementStore, EfPlatformUserManagementStore>();
        services.AddScoped<PlatformUserManagementService>();
        services.AddScoped<IApplicationUnitOfWork, EfApplicationUnitOfWork>();
        services.AddScoped<IAuditTrail, EfAuditTrail>();
        services.AddScoped<UserApplicationService>();
        services.AddScoped<SipatEventApplicationService>();
        services.AddScoped(provider =>
        {
            var options = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<LearningProgressOptions>>();
            return new LearningService(
                provider.GetRequiredService<ITenantContext>(),
                provider.GetRequiredService<ICurrentActor>(),
                provider.GetRequiredService<ILearningStore>(),
                provider.GetRequiredService<IVideoPlaybackProvider>(),
                provider.GetRequiredService<IPlaybackEvidenceVerifier>(),
                provider.GetRequiredService<IApplicationUnitOfWork>(),
                provider.GetRequiredService<IAuditTrail>(),
                provider.GetRequiredService<TimeProvider>(),
                options.Value.CompletionThresholdPercent);
        });
        services.AddScoped<TenantBrandingService>();
        services.AddScoped<DatabaseInitializer>();
        services.AddScoped<IValidator<ProvisionUserRequest>, ProvisionUserRequestValidator>();
        services.AddScoped<IValidator<ListUsersRequest>, ListUsersRequestValidator>();
        services.AddScoped<IValidator<SipatEventDataRequest>, SipatEventDataRequestValidator>();
        services.AddScoped<IValidator<ListSipatEventsRequest>, ListSipatEventsRequestValidator>();
        services.AddScoped<IValidator<UpdateTenantBrandingRequest>, UpdateTenantBrandingRequestValidator>();

        return services;
    }

    private static IVideoPlaybackProvider GetVideoPlaybackProvider(
        IServiceProvider provider,
        IConfiguration configuration)
    {
        if (provider.GetRequiredService<IWebHostEnvironment>().IsDevelopment() &&
            configuration.GetValue<bool>("SipatOnline:Learning:DevelopmentSampleEnabled"))
        {
            return provider.GetRequiredService<DevelopmentCatalogVideoProvider>();
        }

        return new UnconfiguredVideoPlaybackProvider();
    }

    private static IPlaybackEvidenceVerifier GetPlaybackEvidenceVerifier(
        IServiceProvider provider,
        IConfiguration configuration)
    {
        if (provider.GetRequiredService<IWebHostEnvironment>().IsDevelopment() &&
            configuration.GetValue<bool>("SipatOnline:Learning:DevelopmentSampleEnabled"))
        {
            return provider.GetRequiredService<DevelopmentSampleVideoProvider>();
        }

        return new UnconfiguredVideoPlaybackProvider();
    }
}
