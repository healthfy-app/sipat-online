using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application;

/// <summary>An extra (YouTube or Vimeo) is only listed: playing it through the platform or recording progress is refused.</summary>
public static class BonusLesson
{
    public const string RefusedCode = "learning.lesson.bonus";

    public static DomainError Refused { get; } =
        new(RefusedCode, "Este vídeo é um extra e não registra progresso.");
}
