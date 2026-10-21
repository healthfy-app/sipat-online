using System.Reflection;

namespace SipatOnline.ArchitectureTests;

public sealed class ModuleDependencyTests
{
    [Fact]
    public void IdentityDomain_DoesNotDependOnApplication()
    {
        var domainAssembly = Assembly.Load("SipatOnline.Identity.Domain");

        Assert.DoesNotContain(
            domainAssembly.GetReferencedAssemblies(),
            assembly => assembly.Name == "SipatOnline.Identity.Application");
    }
}
