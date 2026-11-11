using SipatOnline.Sipats.Domain.Sipats;

namespace SipatOnline.Sipats.Application.Sipats;

public sealed record SipatEventPage(
    IReadOnlyList<SipatEvent> Items,
    int Offset,
    int Limit,
    int TotalCount);
