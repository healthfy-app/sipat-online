namespace SipatOnline.Learning.Application;

/// <summary>
/// One group a training is for: a unit, narrowed or not to one of its sectors. No sector is the whole unit; no unit
/// is that sector in every unit (the HR of Minas is <c>(Minas, HR)</c>; the HR of the company is <c>(null, HR)</c>).
/// </summary>
public sealed record AudienceTarget(Guid? UnitId, Guid? SectorId)
{
    public bool Includes(Guid? unitId, Guid? sectorId) =>
        (UnitId is null || UnitId == unitId) && (SectorId is null || SectorId == sectorId);
}

/// <summary>
/// Who a training is for: the groups marked on it. No group is the whole company. A person is in when they fall in
/// any of the groups, so someone with no unit is never in a training that names units.
/// </summary>
public sealed record TrainingAudience(IReadOnlyList<AudienceTarget> Targets)
{
    public static TrainingAudience Everyone { get; } = new([]);

    public bool IsEveryone => Targets.Count == 0;

    public bool Includes(Guid? unitId, Guid? sectorId) =>
        Targets.Count == 0 || Targets.Any(target => target.Includes(unitId, sectorId));
}
