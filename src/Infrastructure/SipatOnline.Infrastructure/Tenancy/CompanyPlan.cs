namespace SipatOnline.Infrastructure.Tenancy;

/// <summary>The plans sold on the site: they decide how much a company can personalize. The company itself never sees the name.</summary>
public enum CompanyPlan
{
    Bronze = 0,
    Prata = 1,
    Ouro = 2,
    Diamante = 3
}

/// <summary>
/// What a plan allows. Every plan picks among the ready grades (options 1, 2 and 3), gets daily reports and the standard
/// certificate. Silver personalizes the grid of videos; gold adds its own logo and colors and a personalized certificate;
/// diamond adds a quiz at the end of each module and videos of the company itself.
/// </summary>
public sealed record CompanyCapabilities(bool CustomizeGrid, bool CustomBranding, bool CustomCertificate, bool Quizzes, bool InternalVideos)
{
    public static CompanyCapabilities For(CompanyPlan plan) => new(
        plan >= CompanyPlan.Prata,
        plan >= CompanyPlan.Ouro,
        plan >= CompanyPlan.Ouro,
        plan >= CompanyPlan.Diamante,
        plan >= CompanyPlan.Diamante);
}

public static class CompanyPlans
{
    public static bool TryParse(string? value, out CompanyPlan plan) =>
        Enum.TryParse(value, true, out plan) && Enum.IsDefined(plan);

    /// <summary>The description of a ready theme starts with "Opção 1", "Opção 2" or "Opção 3": these are the ready grades.</summary>
    public static bool IsReadyTheme(string? description) =>
        description is not null && System.Text.RegularExpressions.Regex.IsMatch(description, "^Opção [1-3](?: ·[^\\r\\n]*)?(?:\\r?\\n|$)");
}
