namespace SipatOnline.BuildingBlocks.Application;

public interface IAuditTrail
{
    Task WriteAsync(AuditRecord record, CancellationToken cancellationToken);
}
