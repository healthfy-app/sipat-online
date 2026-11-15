namespace SipatOnline.ArchitectureTests;

public sealed class EndpointDatabaseTests
{
    private static readonly string[] Files =
    [
        "src/Api/SipatOnline.Api/Endpoints/PlaybackQualityDashboardEndpoints.cs",
        "src/Api/SipatOnline.Api/Endpoints/LessonMediaEndpoints.cs"
    ];

    [Fact]
    public void New_endpoint_files_do_not_use_the_database_context()
    {
        var root = AppContext.BaseDirectory;
        while (root is not null && !File.Exists(Path.Combine(root, "SipatOnline.slnx")))
        {
            root = Path.GetDirectoryName(root);
        }

        Assert.NotNull(root);
        foreach (var file in Files)
        {
            var path = Path.Combine(root!, file);
            Assert.True(File.Exists(path), $"{file} does not exist.");
            Assert.DoesNotContain("PlatformDbContext", File.ReadAllText(path));
        }
    }
}
