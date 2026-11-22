namespace SipatOnline.Learning.Application.Quality;

/// <summary>The one sentence the operator reads aloud in the client meeting.</summary>
public static class PlaybackQualityConclusion
{
    public static string For(QualityIndicators indicators, IReadOnlyList<HourBucket> byHour)
    {
        ArgumentNullException.ThrowIfNull(indicators);
        ArgumentNullException.ThrowIfNull(byHour);

        if (indicators.Sessions == 0)
        {
            return "Ainda não há sessões de vídeo registradas neste treinamento.";
        }

        var named = new (string Name, QualityLevel? Level)[]
        {
            ("sessões que não começaram", indicators.NeverStartedPercent.Level),
            ("sessões com travamento", indicators.StalledSessionsPercent.Level),
            ("tempo para começar", indicators.AverageStartupMilliseconds.Level),
            ("tempo travado", indicators.StalledTimePercent.Level)
        };
        var poor = named.Where(item => item.Level == QualityLevel.Poor).Select(item => item.Name).ToArray();
        var attention = named.Where(item => item.Level == QualityLevel.Attention).Select(item => item.Name).ToArray();

        if (poor.Length > 0)
        {
            var text = $"Houve problemas na entrega de vídeo: {Join(poor)} ficaram acima do limite.";
            var worst = byHour.Where(item => item.StalledSessions > 0)
                .OrderByDescending(item => item.StalledSessions).ThenBy(item => item.Hour)
                .FirstOrDefault();
            return worst is null ? text : $"{text} O horário com mais travamentos foi às {worst.Hour}h.";
        }

        return attention.Length > 0
            ? $"A entrega de vídeo funcionou, com pontos de atenção em {Join(attention)}."
            : "A entrega de vídeo funcionou bem: os quatro indicadores ficaram na faixa boa.";
    }

    private static string Join(IReadOnlyList<string> names) =>
        names.Count == 1 ? names[0] : $"{string.Join(", ", names.Take(names.Count - 1))} e {names[^1]}";
}
