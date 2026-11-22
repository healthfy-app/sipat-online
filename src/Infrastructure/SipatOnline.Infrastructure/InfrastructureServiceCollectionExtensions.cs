using Amazon.Runtime;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection.Extensions;
using FluentValidation;
using Microsoft.AspNetCore.DataProtection;
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
            // the first company is optional (a production that starts empty has none): its ID, key and name come together or not at all
            .Validate(
                options => (options.Id == Guid.Empty && string.IsNullOrWhiteSpace(options.Key) && string.IsNullOrWhiteSpace(options.Name)) ||
                           (options.Id != Guid.Empty && TenantKey.Create(options.Key).IsSuccess && !string.IsNullOrWhiteSpace(options.Name)),
                "The first tenant ID, key and name must be configured together (or all left out).")
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

        // Keys live in the database so every instance (and every restart) reads the same ring.
        services.AddDataProtection()
            .SetApplicationName(DataProtectionSetup.ApplicationName)
            .PersistKeysToDbContext<PlatformDbContext>();

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
                // short: the per-login rate limit (LoginAttemptLimiter) already stops brute force, and a
                // guessable registration number must not let anyone keep a colleague out for long
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
            })
            .AddEntityFrameworkStores<PlatformDbContext>()
            .AddDefaultTokenProviders();
        services.AddScoped<IUserClaimsPrincipalFactory<PlatformIdentityUser>, TenantClaimsPrincipalFactory>();
        services.AddScoped<ILoginAttemptCounter, EfLoginAttemptCounter>();

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
        services.AddScoped<ILessonMediaStore, EfLessonMediaStore>();
        services.AddScoped<LessonMediaAccessService>();
        services.AddScoped<SipatOnline.Learning.Application.Quality.IPlaybackQualityStore, EfPlaybackQualityStore>();
        services.AddScoped<SipatOnline.Learning.Application.Quality.PlaybackQualityService>();
        services.AddScoped<SipatOnline.Learning.Application.Quality.IPlaybackQualityDashboardStore, EfPlaybackQualityDashboardStore>();
        services.AddScoped<SipatOnline.Learning.Application.Quality.PlaybackQualityDashboardService>();
        services.AddScoped<LearningEngagementService>();
        services.AddScoped<LearningDistributionService>();
        services.AddScoped<SipatPlanService>();
        services.AddScoped<SipatOnline.Infrastructure.Identity.EmployeeCredentialService>();
        services.AddScoped<SipatOnline.Infrastructure.Identity.CompanyRegistryService>();
        services.AddScoped<SipatOnline.Infrastructure.Identity.ParticipantImportService>();
        services.AddScoped<SipatOnline.Infrastructure.Tenancy.TenantPlanService>();
        services.AddSingleton<ICertificatePdfRenderer, CertificatePdfRenderer>();
        services.AddSingleton<SipatOnline.Learning.Application.Quality.IPlaybackQualityPdfRenderer, PlaybackQualityPdfRenderer>();
        services.AddScoped<IPlatformCourseCatalogStore, EfPlatformCourseCatalogStore>();
        services.AddScoped<PlatformCourseCatalogService>();
        AddPlatformCourseVideoStorage(services, configuration);
        AddVideoConversion(services, configuration);
        ValidatePlaybackProviderSetting(configuration);
        services.AddSingleton<IHostedService>(provider =>
            new PlaybackProviderStartupCheck(provider.GetRequiredService<IHostEnvironment>(), configuration));
        services.AddScoped<IGameModuleStore, EfGameModuleStore>();
        services.AddScoped<GameModuleService>();
        services.AddScoped<ISipatProgramStore, EfSipatProgramStore>();
        services.AddScoped<SipatProgramService>();
        services.AddScoped<DevelopmentLearningSampleInitializer>();
        services.AddScoped<DevelopmentDemoPresentationInitializer>();
        services.AddScoped<DevelopmentEngagementInitializer>();
        services.AddSingleton<DevelopmentSampleVideoProvider>();
        services.AddScoped<DevelopmentCatalogVideoProvider>();
        services.AddScoped<CatalogVideoPlaybackProvider>();
        services.AddScoped<IVideoPlaybackProvider>(provider =>
            GetVideoPlaybackProvider(provider, configuration));
        services.AddScoped<IPlaybackEvidenceVerifier>(provider =>
            GetPlaybackEvidenceVerifier(provider, configuration));
        services.AddSingleton<TenantHostCache>();
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

    private static void AddPlatformCourseVideoStorage(IServiceCollection services, IConfiguration configuration)
    {
        var provider = configuration["SipatOnline:VideoStorage:Provider"];
        var isR2 = string.Equals(provider, "R2", StringComparison.OrdinalIgnoreCase);
        if (!isR2 && !string.IsNullOrEmpty(provider) &&
            !string.Equals(provider, "File", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Configure SipatOnline:VideoStorage:Provider como File ou R2.");
        }

        if (isR2)
        {
            var options = new R2StorageOptions
            {
                ServiceUrl = RequireR2Setting(configuration, nameof(R2StorageOptions.ServiceUrl)),
                AccessKeyId = RequireR2Setting(configuration, nameof(R2StorageOptions.AccessKeyId)),
                SecretAccessKey = RequireR2Setting(configuration, nameof(R2StorageOptions.SecretAccessKey)),
                Bucket = RequireR2Setting(configuration, nameof(R2StorageOptions.Bucket)),
                DirectUpload = configuration.GetValue<bool>(
                    $"{R2StorageOptions.SectionName}:{nameof(R2StorageOptions.DirectUpload)}")
            };
            services.AddSingleton(options);
            services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(
                new BasicAWSCredentials(options.AccessKeyId, options.SecretAccessKey),
                new AmazonS3Config
                {
                    ServiceURL = options.ServiceUrl,
                    ForcePathStyle = true,
                    AuthenticationRegion = "auto",
                    RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                    ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
                }));
            services.TryAddSingleton(TimeProvider.System);
            services.AddSingleton<IPlatformCourseVideoStorage, R2PlatformCourseVideoStorage>();
            if (options.DirectUpload)
            {
                services.AddSingleton<IDirectVideoUploadStore, R2DirectVideoUploadStore>();
            }
            else
            {
                services.AddSingleton<IDirectVideoUploadStore, NoDirectVideoUploadStore>();
            }

            return;
        }

        services.AddSingleton<IDirectVideoUploadStore, NoDirectVideoUploadStore>();
        services.AddSingleton<IPlatformCourseVideoStorage>(serviceProvider =>
            new FilePlatformCourseVideoStorage(
                configuration["SipatOnline:PlatformCatalog:StoragePath"],
                serviceProvider.GetRequiredService<IHostEnvironment>().IsDevelopment()));
    }

    private static void AddVideoConversion(IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(VideoConversionOptions.SectionName).Get<VideoConversionOptions>()
            ?? new VideoConversionOptions();
        if (options.Enabled && string.IsNullOrWhiteSpace(options.WorkPath))
        {
            throw new InvalidOperationException($"Configure {VideoConversionOptions.SectionName}:WorkPath.");
        }

        if (options.LeaseRenewInterval <= TimeSpan.Zero || options.LeaseRenewInterval >= options.LeaseDuration)
        {
            throw new InvalidOperationException(
                $"{VideoConversionOptions.SectionName}:LeaseRenewInterval must be positive and shorter than LeaseDuration.");
        }

        services.AddSingleton(options);
        services.AddSingleton<VideoConversionSignal>();
        services.AddSingleton<VideoConversionInstance>();
        services.AddSingleton<VideoConversionActivity>();
        services.AddSingleton<FfmpegVideoTranscoder>();
        if (string.Equals(configuration["SipatOnline:VideoStorage:Provider"], "R2", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IVideoSourceStore, R2VideoSourceStore>();
        }
        else
        {
            services.AddSingleton<IVideoSourceStore, FileVideoSourceStore>();
        }

        services.AddScoped<IVideoConversionQueue, EfVideoConversionQueue>();
        services.AddScoped<VideoConversionProcessor>();
        if (options.Enabled && options.RunInBackground)
        {
            // One worker per instance, one conversion at a time; instances share the queue through leases.
            services.AddHostedService<VideoConversionWorker>();
        }
    }

    private static string RequireR2Setting(IConfiguration configuration, string field) =>
        configuration[$"{R2StorageOptions.SectionName}:{field}"] is { Length: > 0 } value && !string.IsNullOrWhiteSpace(value)
            ? value
            : throw new InvalidOperationException($"Configure {R2StorageOptions.SectionName}:{field}.");

    private static void ValidatePlaybackProviderSetting(IConfiguration configuration)
    {
        var configured = configuration["SipatOnline:Learning:Playback:Provider"];
        if (!string.IsNullOrEmpty(configured) &&
            !string.Equals(configured, "Development", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(configured, "Catalog", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Configure SipatOnline:Learning:Playback:Provider como Development ou Catalog.");
        }
    }

    /// <summary>Stops the API at startup when the development playback provider is set outside development.</summary>
    private sealed class PlaybackProviderStartupCheck(IHostEnvironment environment, IConfiguration configuration)
        : IHostedService
    {
        public Task StartAsync(CancellationToken cancellationToken)
        {
            if (string.Equals(
                    configuration["SipatOnline:Learning:Playback:Provider"],
                    "Development",
                    StringComparison.OrdinalIgnoreCase) &&
                !environment.IsDevelopment())
            {
                throw new InvalidOperationException(
                    "SipatOnline:Learning:Playback:Provider=Development só pode ser usado em desenvolvimento.");
            }

            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private static bool UseDevelopmentPlayback(IServiceProvider provider, IConfiguration configuration)
    {
        var configured = configuration["SipatOnline:Learning:Playback:Provider"];
        if (string.Equals(configured, "Development", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(configured, "Catalog", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return provider.GetRequiredService<IWebHostEnvironment>().IsDevelopment() &&
               configuration.GetValue<bool>("SipatOnline:Learning:DevelopmentSampleEnabled");
    }

    private static IVideoPlaybackProvider GetVideoPlaybackProvider(
        IServiceProvider provider,
        IConfiguration configuration) =>
        UseDevelopmentPlayback(provider, configuration)
            ? provider.GetRequiredService<DevelopmentCatalogVideoProvider>()
            : provider.GetRequiredService<CatalogVideoPlaybackProvider>();

    private static IPlaybackEvidenceVerifier GetPlaybackEvidenceVerifier(
        IServiceProvider provider,
        IConfiguration configuration) =>
        UseDevelopmentPlayback(provider, configuration)
            ? provider.GetRequiredService<DevelopmentSampleVideoProvider>()
            : provider.GetRequiredService<CatalogVideoPlaybackProvider>();
}
