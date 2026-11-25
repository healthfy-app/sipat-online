namespace SipatOnline.Learning.Application.Catalog;

/// <summary>
/// The catalog is the operation's. A company's administrator edits one thing in it: the company's own training. The
/// endpoint that receives that request checks that the training is the company's and that its plan allows the change,
/// and only then grants, for that request alone, what the catalog services otherwise keep to the operation.
/// </summary>
public sealed class CatalogAccessGrant
{
    public bool Granted { get; private set; }

    public void Grant() => Granted = true;
}
