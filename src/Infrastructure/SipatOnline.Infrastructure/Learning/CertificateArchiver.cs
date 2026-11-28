using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SipatOnline.Learning.Application;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Wakes the archive as soon as a certificate is issued, instead of at its next round.</summary>
public sealed class CertificateArchiveSignal
{
    private readonly SemaphoreSlim pending = new(0, 1);

    public void Notify()
    {
        try
        {
            pending.Release();
        }
        catch (SemaphoreFullException)
        {
            // already signalled; the archive looks at every certificate anyway
        }
    }

    public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
        pending.WaitAsync(timeout, cancellationToken);
}

/// <summary>
/// Keeps the archive in step with the certificates: it saves the PDF of each certificate not saved yet (the new ones, and
/// those issued before the archive existed) and moves to its new place the PDF of someone whose company, unit, sector or
/// name changed. Each certificate is drawn once, with the template it was issued with; afterwards it is only moved.
/// </summary>
public sealed class CertificateArchiver(
    PlatformDbContext db,
    ILearningEngagementStore store,
    ICertificatePdfRenderer renderer,
    ICertificateArchive archive,
    ILogger<CertificateArchiver> logger)
{
    /// <summary>How many PDFs it saved or moved.</summary>
    public async Task<int> ArchiveAsync(CancellationToken token)
    {
        if (!archive.IsAvailable) return 0;
        // only small columns, for every certificate: the place each one should be in is worked out here and compared
        var certificates = await (
            from certificate in db.ParticipationCertificates.AsNoTracking()
            join user in db.Users.AsNoTracking() on certificate.ParticipantId equals user.Id
            join company in db.Tenants.AsNoTracking() on certificate.TenantId equals company.Id
            join unit in db.CompanyUnits.AsNoTracking() on user.UnitId equals (Guid?)unit.Id into units
            from unit in units.DefaultIfEmpty()
            join sector in db.CompanySectors.AsNoTracking() on user.SectorId equals (Guid?)sector.Id into sectors
            from sector in sectors.DefaultIfEmpty()
            select new
            {
                certificate.Id,
                certificate.TenantId,
                certificate.ArchiveKey,
                certificate.IssuedAt,
                certificate.EventTitle,
                CompanyKey = company.Key,
                user.DisplayName,
                user.EmployeeIdentifier,
                UnitName = unit == null ? null : unit.Name,
                SectorName = sector == null ? null : sector.Name
            }).ToListAsync(token);

        var done = 0;
        foreach (var item in certificates)
        {
            var key = CertificateArchivePath.For(item.CompanyKey, item.UnitName, item.SectorName, item.DisplayName,
                item.EmployeeIdentifier, item.IssuedAt, item.EventTitle, item.Id);
            if (item.ArchiveKey == key) continue;
            try
            {
                // moved when it was saved before; drawn again only if nothing is at the old place
                if (item.ArchiveKey is null || !await archive.MoveAsync(item.ArchiveKey, key, token))
                {
                    var certificate = await store.FindCertificateAsync(item.TenantId, Guid.Empty, item.Id, true, token);
                    if (certificate is null) continue;
                    await archive.SaveAsync(key, renderer.Render(certificate), token);
                }

                await db.ParticipationCertificates.Where(row => row.Id == item.Id)
                    .ExecuteUpdateAsync(update => update.SetProperty(row => row.ArchiveKey, key), token);
                done++;
            }
            catch (Exception exception) when (!token.IsCancellationRequested)
            {
                // one certificate that fails does not hold the others back; it is tried again at the next round
                logger.LogError(exception, "The certificate {CertificateId} could not be saved in the archive", item.Id);
            }
        }

        return done;
    }

    /// <summary>The PDF of a certificate: the one saved in the archive, or drawn now when it is not saved yet.</summary>
    public async Task<Stream> OpenAsync(ParticipationCertificate certificate, CancellationToken token)
    {
        if (archive.IsAvailable)
        {
            var key = await db.ParticipationCertificates.AsNoTracking().Where(row => row.Id == certificate.Id)
                .Select(row => row.ArchiveKey).SingleOrDefaultAsync(token);
            try
            {
                if (key is not null && await archive.OpenReadAsync(key, token) is { } saved) return saved;
            }
            catch (Exception exception) when (!token.IsCancellationRequested)
            {
                // the archive out of reach must not keep the person from their certificate
                logger.LogWarning(exception, "The certificate {CertificateId} could not be read from the archive", certificate.Id);
            }
        }

        return new MemoryStream(renderer.Render(certificate), writable: false);
    }
}

/// <summary>
/// The archive of this instance: a round at start, one every few minutes (a change of unit, sector or name is moved then)
/// and one as soon as a certificate is issued. Two instances doing the same round save the same PDF at the same key.
/// </summary>
public sealed class CertificateArchiveWorker(
    IServiceScopeFactory scopes,
    CertificateArchiveSignal signal,
    ICertificateArchive archive,
    ILogger<CertificateArchiveWorker> logger) : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!archive.IsAvailable) return;
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var count = await scope.ServiceProvider.GetRequiredService<CertificateArchiver>().ArchiveAsync(stoppingToken);
                if (count > 0) logger.LogInformation("{Count} certificates saved or moved in the archive", count);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // usually the database is out of reach, or not migrated yet while the API starts: tried again later
                logger.LogWarning(exception, "The certificate archive could not read the certificates");
            }

            try
            {
                await signal.WaitAsync(Interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }
}
