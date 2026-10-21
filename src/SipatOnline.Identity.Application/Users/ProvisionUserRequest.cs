namespace SipatOnline.Identity.Application.Users;

public sealed record ProvisionUserRequest(
    string LoginIdentifier,
    string DisplayName,
    string InitialPassword,
    string Role);
