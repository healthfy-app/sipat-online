using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Domain.UnitTests.Users;

public sealed class ProfileTextTests
{
    [Theory]
    [InlineData("MARIA DAS GRAÇAS DE SOUZA", "Maria das Graças de Souza")]
    [InlineData("  joão   da  silva ", "João da Silva")]
    [InlineData("DA SILVA", "Da Silva")]
    [InlineData("ANA-LUÍSA D'ÁVILA", "Ana-Luísa D'Ávila")]
    [InlineData("josé e maria", "José e Maria")]
    public void PersonName_Standardizes(string input, string expected) => Assert.Equal(expected, ProfileText.PersonName(input));

    [Theory]
    [InlineData("12.345-6", "123456")]
    [InlineData(" ab 12 ", "AB12")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void RegistrationNumber_KeepsLettersAndDigits(string? input, string? expected) => Assert.Equal(expected, ProfileText.RegistrationNumber(input).Value.Value);

    [Fact]
    public void RegistrationNumber_OnlySymbols_Fails() => Assert.Equal("profile.registration.invalid", ProfileText.RegistrationNumber(".-").Error.Code);

    [Fact]
    public void RegistrationNumber_TooLong_Fails() => Assert.Equal("profile.registration.invalid", ProfileText.RegistrationNumber(new string('1', 65)).Error.Code);

    [Theory]
    [InlineData("(27) 99999-1234", "27999991234")]
    [InlineData("+55 27 3333-1234", "2733331234")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Phone_KeepsDigits(string? input, string? expected) => Assert.Equal(expected, ProfileText.Phone(input).Value.Value);

    [Fact]
    public void Phone_TooShort_Fails() => Assert.Equal("profile.phone.invalid", ProfileText.Phone("9999-1234").Error.Code);

    [Theory]
    [InlineData(" Maria@Empresa.COM ", "maria@empresa.com")]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void Email_Lowercases(string? input, string? expected) => Assert.Equal(expected, ProfileText.Email(input).Value.Value);

    [Theory]
    [InlineData("maria")]
    [InlineData("maria@empresa")]
    [InlineData("a b@empresa.com")]
    public void Email_Invalid_Fails(string input) => Assert.Equal("profile.email.invalid", ProfileText.Email(input).Error.Code);

    [Fact]
    public void CatalogKey_IgnoresAccentsCaseAndSpaces() =>
        Assert.Equal(ProfileText.CatalogKey("Tecnologia da Informação"), ProfileText.CatalogKey("  tecnologia  da informacao "));

    [Theory]
    [InlineData("Maria das Graças de Souza", "maria.souza")]
    [InlineData("João", "joao")]
    [InlineData("Ana-Luísa D'Ávila", "analuisa.davila")]
    public void LoginCandidate_UsesFirstAndLastName(string name, string expected) => Assert.Equal(expected, ProfileText.LoginCandidate(name));
}
