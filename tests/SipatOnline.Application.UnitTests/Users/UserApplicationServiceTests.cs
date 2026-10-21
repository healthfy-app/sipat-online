using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Application.UnitTests.Users;

public sealed class UserApplicationServiceTests
{
    private static readonly DateTimeOffset CurrentTime =
        new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ProvisionAsync_WithClientAdminAndParticipant_CreatesInCurrentTenant()
    {
        var tenantId = TenantId.New();
        var store = new FakeUserAccountStore();
        var auditTrail = new FakeAuditTrail();
        var service = CreateService(tenantId, PlatformRoles.ClientAdmin, store, auditTrail: auditTrail);

        var result = await service.ProvisionAsync(
            new ProvisionUserRequest("Mat-001", "Ana Silva", "not-logged", PlatformRoles.Participant),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(tenantId, result.Value.TenantId);
        Assert.Equal("MAT-001", result.Value.LoginIdentifier.NormalizedValue);
        Assert.Equal("not-logged", store.LastInitialPassword);
        Assert.Equal(PlatformRoles.Participant, store.LastRole);
        Assert.Equal("identity.user.provisioned", Assert.Single(auditTrail.Records).Action);
    }

    [Fact]
    public async Task ProvisionAsync_WithoutTenantContext_FailsBeforeAccessingStore()
    {
        var store = new FakeUserAccountStore();
        var service = CreateService(null, PlatformRoles.SuperAdmin, store);

        var result = await service.ProvisionAsync(
            new ProvisionUserRequest("Mat-001", "Ana Silva", "password", PlatformRoles.Participant),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("tenant.context.required", result.Error.Code);
        Assert.Null(store.LastCreatedUser);
    }

    [Fact]
    public async Task ProvisionAsync_ClientAdminCannotGrantAdministrativeRole()
    {
        var store = new FakeUserAccountStore();
        var service = CreateService(TenantId.New(), PlatformRoles.ClientAdmin, store);

        var result = await service.ProvisionAsync(
            new ProvisionUserRequest("Mat-001", "Ana Silva", "password", PlatformRoles.ClientAdmin),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("identity.role.assignment_forbidden", result.Error.Code);
        Assert.Null(store.LastCreatedUser);
    }

    [Fact]
    public async Task ProvisionAsync_UnauthorizedActorCannotCreateAccount()
    {
        var store = new FakeUserAccountStore();
        var service = CreateService(TenantId.New(), PlatformRoles.Participant, store);

        var result = await service.ProvisionAsync(
            new ProvisionUserRequest("Mat-001", "Ana Silva", "password", PlatformRoles.Participant),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("identity.forbidden", result.Error.Code);
        Assert.Null(store.LastCreatedUser);
    }

    [Fact]
    public async Task ProvisionAsync_InvalidRequestDoesNotCallStore()
    {
        var store = new FakeUserAccountStore();
        var service = CreateService(TenantId.New(), PlatformRoles.SuperAdmin, store);

        var result = await service.ProvisionAsync(
            new ProvisionUserRequest("", "Ana Silva", "password", PlatformRoles.Participant),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Null(store.LastCreatedUser);
    }

    [Fact]
    public async Task RenameAsync_UserFromDifferentTenantIsNotFound()
    {
        var store = new FakeUserAccountStore();
        var user = CreateUser(TenantId.New(), "Mat-001", "Ana Silva");
        store.AddExisting(user);
        var service = CreateService(TenantId.New(), PlatformRoles.ClientAdmin, store);

        var result = await service.RenameAsync(user.Id, "Maria Souza", CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("user.not_found", result.Error.Code);
        Assert.Equal("Ana Silva", user.DisplayName.Value);
    }

    [Fact]
    public async Task SignInAsync_WithMissingTenant_ReturnsGenericFailureWithoutCallingProvider()
    {
        var signInService = new FakeSignInService();
        var service = CreateService(null, PlatformRoles.Participant, new FakeUserAccountStore(), signInService);

        var result = await service.SignInAsync("Mat-001", "password", CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value);
        Assert.False(signInService.WasCalled);
    }

    private static UserApplicationService CreateService(
        TenantId? tenantId,
        string role,
        FakeUserAccountStore store,
        FakeSignInService? signInService = null,
        FakeAuditTrail? auditTrail = null)
    {
        var actor = new FakeCurrentActor(role);
        return new UserApplicationService(
            new FakeTenantContext(tenantId),
            actor,
            store,
            signInService ?? new FakeSignInService(),
            new FakeUnitOfWork(),
            auditTrail ?? new FakeAuditTrail(),
            new ProvisionUserRequestValidator(),
            new FakeTimeProvider(CurrentTime));
    }

    private static User CreateUser(TenantId tenantId, string loginIdentifier, string displayName)
    {
        var result = User.Create(tenantId, loginIdentifier, displayName, CurrentTime);
        Assert.True(result.IsSuccess);
        return result.Value;
    }

    private sealed class FakeTenantContext(TenantId? tenantId) : ITenantContext
    {
        public TenantId? CurrentTenantId { get; } = tenantId;
    }

    private sealed class FakeCurrentActor(string role) : ICurrentActor
    {
        public string? UserId { get; } = "00000000-0000-0000-0000-000000000001";

        public bool IsInRole(string candidateRole) =>
            string.Equals(role, candidateRole, StringComparison.Ordinal);
    }

    private sealed class FakeAuditTrail : IAuditTrail
    {
        public List<AuditRecord> Records { get; } = [];

        public Task WriteAsync(AuditRecord record, CancellationToken cancellationToken)
        {
            Records.Add(record);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeUnitOfWork : IApplicationUnitOfWork
    {
        public Task<IApplicationTransaction> BeginTransactionAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IApplicationTransaction>(new FakeTransaction());
    }

    private sealed class FakeTransaction : IApplicationTransaction
    {
        public Task CommitAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class FakeTimeProvider(DateTimeOffset currentTime) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => currentTime;
    }

    private sealed class FakeUserAccountStore : IUserAccountStore
    {
        private readonly List<User> users = [];

        public User? LastCreatedUser { get; private set; }

        public string? LastInitialPassword { get; private set; }

        public string? LastRole { get; private set; }

        public Task<Result<User>> CreateAsync(
            User user,
            string initialPassword,
            string role,
            CancellationToken cancellationToken)
        {
            LastCreatedUser = user;
            LastInitialPassword = initialPassword;
            LastRole = role;
            users.Add(user);
            return Task.FromResult(Result<User>.Success(user));
        }

        public Task<User?> FindAsync(
            TenantId tenantId,
            UserId userId,
            CancellationToken cancellationToken) =>
            Task.FromResult(users.SingleOrDefault(user => user.TenantId == tenantId && user.Id == userId));

        public Task<Result<User>> UpdateAsync(User user, CancellationToken cancellationToken) =>
            Task.FromResult(Result<User>.Success(user));

        public void AddExisting(User user) => users.Add(user);
    }

    private sealed class FakeSignInService : IUserSignInService
    {
        public bool WasCalled { get; private set; }

        public Task<Result<bool>> SignInAsync(
            TenantId tenantId,
            string loginIdentifier,
            string password,
            CancellationToken cancellationToken)
        {
            WasCalled = true;
            return Task.FromResult(Result<bool>.Success(false));
        }

        public Task SignOutAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
