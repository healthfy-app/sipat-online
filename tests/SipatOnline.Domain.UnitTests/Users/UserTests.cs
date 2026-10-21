using SipatOnline.Identity.Domain.Users;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Domain.UnitTests.Users;

public sealed class UserTests
{
    private static readonly DateTimeOffset CreatedAt =
        new(2026, 10, 21, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_WithValidName_CreatesActiveUserWithInternalId()
    {
        var result = User.Create(TenantId.New(), "  Mat-001  ", "  Ana Silva  ", CreatedAt);

        Assert.True(result.IsSuccess);
        Assert.False(result.Value.Id.IsEmpty);
        Assert.Equal("MAT-001", result.Value.LoginIdentifier.NormalizedValue);
        Assert.Equal("Mat-001", result.Value.LoginIdentifier.Value);
        Assert.Equal("Ana Silva", result.Value.DisplayName.Value);
        Assert.Equal(CreatedAt, result.Value.CreatedAt);
        Assert.True(result.Value.IsActive);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_WithoutLoginIdentifier_ReturnsDomainError(string? loginIdentifier)
    {
        var result = User.Create(TenantId.New(), loginIdentifier, "Ana Silva", CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("user.login_identifier.required", result.Error.Code);
    }

    [Fact]
    public void Create_WithoutTenant_ReturnsDomainError()
    {
        var result = User.Create(default, "Mat-001", "Ana Silva", CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("user.tenant.required", result.Error.Code);
    }

    [Fact]
    public void Create_WithoutDisplayName_ReturnsDomainError()
    {
        var result = User.Create(TenantId.New(), "Mat-001", " ", CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("user.display_name.required", result.Error.Code);
    }

    [Fact]
    public void LoginIdentifier_NormalizesUnicodeAndCase()
    {
        var first = LoginIdentifier.Create("  Mat-001 ");
        var equivalent = LoginIdentifier.Create("mat-001");

        Assert.True(first.IsSuccess);
        Assert.True(equivalent.IsSuccess);
        Assert.Equal(first.Value.NormalizedValue, equivalent.Value.NormalizedValue);
    }

    [Fact]
    public void Create_WithControlCharacterInLogin_ReturnsDomainError()
    {
        var result = User.Create(TenantId.New(), "mat-\n001", "Ana Silva", CreatedAt);

        Assert.False(result.IsSuccess);
        Assert.Equal("user.login_identifier.invalid", result.Error.Code);
    }

    [Fact]
    public void FailureResult_DoesNotExposeValue()
    {
        var result = User.Create(TenantId.New(), null, "Ana Silva", CreatedAt);

        Assert.Throws<InvalidOperationException>(() => _ = result.Value);
    }

    [Fact]
    public void SuccessResult_DoesNotExposeError()
    {
        var result = User.Create(TenantId.New(), "Mat-001", "Ana Silva", CreatedAt);

        Assert.Throws<InvalidOperationException>(() => _ = result.Error);
    }

    [Fact]
    public void Rename_WithValidName_UpdatesName()
    {
        var user = CreateUser();

        var result = user.Rename("Maria Souza");

        Assert.True(result.IsSuccess);
        Assert.Equal("Maria Souza", user.DisplayName.Value);
    }

    [Fact]
    public void Rename_WithInvalidName_PreservesCurrentName()
    {
        var user = CreateUser();

        var result = user.Rename(" ");

        Assert.False(result.IsSuccess);
        Assert.Equal("Ana Silva", user.DisplayName.Value);
    }

    [Fact]
    public void Deactivate_AndReactivate_AreIdempotent()
    {
        var user = CreateUser();

        Assert.True(user.Deactivate());
        Assert.False(user.Deactivate());
        Assert.False(user.IsActive);

        Assert.True(user.Reactivate());
        Assert.False(user.Reactivate());
        Assert.True(user.IsActive);
    }

    [Fact]
    public void Rename_WhenInactive_ReturnsError()
    {
        var user = CreateUser();
        user.Deactivate();

        var result = user.Rename("Maria Souza");

        Assert.False(result.IsSuccess);
        Assert.Equal("user.inactive", result.Error.Code);
        Assert.Equal("Ana Silva", user.DisplayName.Value);
    }

    private static User CreateUser()
    {
        var result = User.Create(TenantId.New(), "Mat-001", "Ana Silva", CreatedAt);
        Assert.True(result.IsSuccess);
        return result.Value;
    }
}
