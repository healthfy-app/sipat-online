using System.Reflection;

namespace SipatOnline.ArchitectureTests;

public sealed class ModuleDependencyTests
{
    [Fact]
    public void DomainModules_DoNotDependOnOuterLayers()
    {
        var forbiddenDependencies = new[]
        {
            "SipatOnline.Identity.Application",
            "SipatOnline.Tenancy.Application",
            "SipatOnline.Infrastructure",
            "SipatOnline.Api"
        };

        AssertDoesNotReference("SipatOnline.Identity.Domain", forbiddenDependencies);
        AssertDoesNotReference("SipatOnline.Tenancy.Domain", forbiddenDependencies);
        AssertDoesNotReference("SipatOnline.Sipats.Domain", forbiddenDependencies);
    }

    [Fact]
    public void ApplicationModules_DoNotDependOnInfrastructureOrApi()
    {
        var forbiddenDependencies = new[]
        {
            "SipatOnline.Infrastructure",
            "SipatOnline.Api"
        };

        AssertDoesNotReference("SipatOnline.Identity.Application", forbiddenDependencies);
        AssertDoesNotReference("SipatOnline.Tenancy.Application", forbiddenDependencies);
        AssertDoesNotReference("SipatOnline.Sipats.Application", forbiddenDependencies);
    }

    [Fact]
    public void Infrastructure_DoesNotDependOnApi()
    {
        AssertDoesNotReference("SipatOnline.Infrastructure", "SipatOnline.Api");
    }

    private static void AssertDoesNotReference(string assemblyName, params string[] forbiddenDependencies)
    {
        var assembly = Assembly.Load(assemblyName);
        var referencedAssemblyNames = assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var dependency in forbiddenDependencies)
        {
            Assert.DoesNotContain(dependency, referencedAssemblyNames);
        }
    }
}
