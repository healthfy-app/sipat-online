namespace SipatOnline.Identity.Application.Users;

/// <summary><c>UnitId</c>: only the participants of that unit (the pages of a company with a unit chosen at the top).</summary>
public sealed record ListUsersRequest(int Offset = 0, int Limit = 50, Guid? UnitId = null);
