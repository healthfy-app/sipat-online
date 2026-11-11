namespace SipatOnline.Identity.Application.Users;

public sealed record ListUsersRequest(int Offset = 0, int Limit = 50);
