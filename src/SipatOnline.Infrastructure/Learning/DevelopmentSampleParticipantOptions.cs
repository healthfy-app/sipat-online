namespace SipatOnline.Infrastructure.Learning;

public sealed class DevelopmentSampleParticipantOptions
{
    public const string SectionName = "SipatOnline:Learning:DevelopmentSampleParticipant";

    public string? LoginIdentifier { get; set; }

    public string? DisplayName { get; set; }

    public string? Password { get; set; }
}
