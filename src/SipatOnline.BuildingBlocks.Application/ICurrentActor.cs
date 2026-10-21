namespace SipatOnline.BuildingBlocks.Application;

public interface ICurrentActor
{
    string? UserId { get; }

    bool IsInRole(string role);
}
