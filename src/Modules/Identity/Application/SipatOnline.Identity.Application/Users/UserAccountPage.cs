using SipatOnline.Identity.Domain.Users;

namespace SipatOnline.Identity.Application.Users;

public sealed record UserAccountPage(
    IReadOnlyList<User> Items,
    int Offset,
    int Limit,
    int TotalCount);
