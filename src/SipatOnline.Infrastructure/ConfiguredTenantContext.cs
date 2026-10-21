using Microsoft.Extensions.Options;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Infrastructure;

public sealed class ConfiguredTenantContext(IOptions<TenantRuntimeOptions> options) : ITenantContext
{
    public TenantId? CurrentTenantId { get; } = new(options.Value.Id);
}
