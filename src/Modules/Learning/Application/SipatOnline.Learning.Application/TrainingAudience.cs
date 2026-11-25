namespace SipatOnline.Learning.Application;

/// <summary>
/// Who a training is for: the units and the sectors marked on it. Nothing marked means the whole company.
/// A person is in when their unit is one of the marked ones (or none is marked) and the same for their sector,
/// so someone with no unit is never in a training that names units.
/// </summary>
public sealed record TrainingAudience(IReadOnlySet<Guid> UnitIds, IReadOnlySet<Guid> SectorIds)
{
    public static TrainingAudience Everyone { get; } = new(new HashSet<Guid>(), new HashSet<Guid>());

    public bool IsEveryone => UnitIds.Count == 0 && SectorIds.Count == 0;

    public bool Includes(Guid? unitId, Guid? sectorId) =>
        (UnitIds.Count == 0 || (unitId is { } unit && UnitIds.Contains(unit))) &&
        (SectorIds.Count == 0 || (sectorId is { } sector && SectorIds.Contains(sector)));
}
