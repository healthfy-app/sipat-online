using System.Net;
using System.Net.Http.Headers;
using System.Web;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.IntegrationTests;

/// <summary>The browser's presigned PUT against a real bucket (MinIO), and what the API reads back at complete.</summary>
public sealed class R2DirectVideoUploadStoreTests
{
    private static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 1, 2, 3, 4];

    [DockerFact]
    public async Task Presigned_put_uploads_and_inspect_reports_size_type_and_header()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = Store(minio);
        var id = Guid.NewGuid();

        var ticket = await store.CreateAsync(id, "video/mp4", TimeSpan.FromHours(1), default);
        using var put = await PutAsync(ticket.UploadUrl, Mp4, "video/mp4");

        Assert.True(put.IsSuccessStatusCode, await put.Content.ReadAsStringAsync());
        Assert.Equal(id, ticket.VideoId);
        Assert.Equal("video/mp4", ticket.ContentType);
        Assert.Equal(Mp4, await minio.ReadAsync(R2VideoSourceStore.KeyFor(id)));
        var uploaded = await store.InspectAsync(id, default);
        Assert.NotNull(uploaded);
        Assert.Equal(Mp4.Length, uploaded!.SizeBytes);
        Assert.Equal("video/mp4", uploaded.ContentType);
        Assert.Equal(Mp4[..12], uploaded.Header);
    }

    [DockerFact]
    public async Task Inspect_returns_null_for_a_missing_upload()
    {
        await using var minio = await MinioFixture.StartAsync();

        Assert.Null(await Store(minio).InspectAsync(Guid.NewGuid(), default));
    }

    [DockerFact]
    public async Task A_put_with_another_content_type_is_refused_by_the_bucket()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = Store(minio);
        var id = Guid.NewGuid();
        var ticket = await store.CreateAsync(id, "video/mp4", TimeSpan.FromHours(1), default);

        using var put = await PutAsync(ticket.UploadUrl, Mp4, "text/html");

        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
        Assert.False(await minio.ExistsAsync(R2VideoSourceStore.KeyFor(id)));
    }

    [DockerFact]
    public async Task Promote_moves_the_upload_to_the_720p_key()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = Store(minio);
        var id = Guid.NewGuid();
        var ticket = await store.CreateAsync(id, "video/mp4", TimeSpan.FromHours(1), default);
        using (var put = await PutAsync(ticket.UploadUrl, Mp4, "video/mp4"))
        {
            Assert.True(put.IsSuccessStatusCode);
        }

        await store.PromoteAsync(id, "video/mp4", default);

        var hd = R2PlatformCourseVideoStorage.KeyFor(id, VideoRendition.Hd720);
        Assert.Equal(Mp4, await minio.ReadAsync(hd));
        Assert.Equal("video/mp4", (await minio.Client.GetObjectMetadataAsync(MinioFixture.Bucket, hd)).Headers.ContentType);
        Assert.False(await minio.ExistsAsync(R2VideoSourceStore.KeyFor(id)));

        await store.DeleteAsync(id, default);
        Assert.True(await minio.ExistsAsync(hd));
    }

    [DockerFact]
    public async Task Url_expires_after_one_hour()
    {
        await using var minio = await MinioFixture.StartAsync();
        var before = DateTimeOffset.UtcNow;

        var ticket = await Store(minio).CreateAsync(Guid.NewGuid(), "video/webm", TimeSpan.FromHours(1), default);

        var query = HttpUtility.ParseQueryString(ticket.UploadUrl.Query);
        var expires = int.Parse(query["X-Amz-Expires"]!, System.Globalization.CultureInfo.InvariantCulture);
        Assert.InRange(expires, 3600, 3602);
        Assert.Contains("content-type", query["X-Amz-SignedHeaders"]!.Split(';'));
        Assert.InRange(ticket.ExpiresAt, before.AddHours(1).AddSeconds(-1), DateTimeOffset.UtcNow.AddHours(1).AddSeconds(1));
        Assert.Equal(Uri.UriSchemeHttp, ticket.UploadUrl.Scheme);
    }

    private static R2DirectVideoUploadStore Store(MinioFixture minio) =>
        new(minio.Client, minio.Options, TimeProvider.System);

    /// <summary>What the browser does: a bare PUT with the body and the Content-Type the URL was signed for.</summary>
    internal static async Task<HttpResponseMessage> PutAsync(Uri url, byte[] body, string contentType)
    {
        using var http = new HttpClient();
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        return await http.PutAsync(url, content);
    }
}
