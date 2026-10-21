namespace SipatOnline.Sipats.Application.Sipats;

public sealed record SipatEventDataRequest(
    string? Title,
    string? Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt);
