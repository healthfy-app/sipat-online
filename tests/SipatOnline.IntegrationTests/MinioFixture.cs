using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.Minio;

namespace SipatOnline.IntegrationTests;

/// <summary>A throwaway MinIO with one bucket, the S3 client the app would build for R2 and the matching options.</summary>
internal sealed class MinioFixture : IAsyncDisposable
{
    public const string Bucket = "videos";

    private readonly MinioContainer container;

    private MinioFixture(MinioContainer container, AmazonS3Client client)
    {
        this.container = container;
        Client = client;
        Options = new R2StorageOptions
        {
            ServiceUrl = container.GetConnectionString(),
            AccessKeyId = container.GetAccessKey(),
            SecretAccessKey = container.GetSecretKey(),
            Bucket = Bucket
        };
    }

    public AmazonS3Client Client { get; }

    public R2StorageOptions Options { get; }

    /// <summary>The settings that make the API use this bucket as <c>Provider=R2</c>.</summary>
    public IReadOnlyDictionary<string, string> ApiSettings => new Dictionary<string, string>
    {
        ["SipatOnline:VideoStorage:Provider"] = "R2",
        [$"{R2StorageOptions.SectionName}:ServiceUrl"] = Options.ServiceUrl,
        [$"{R2StorageOptions.SectionName}:AccessKeyId"] = Options.AccessKeyId,
        [$"{R2StorageOptions.SectionName}:SecretAccessKey"] = Options.SecretAccessKey,
        [$"{R2StorageOptions.SectionName}:Bucket"] = Options.Bucket
    };

    public static async Task<MinioFixture> StartAsync()
    {
        var container = new MinioBuilder(TestImages.Minio).Build();
        await container.StartAsync();
        var client = new AmazonS3Client(
            new BasicAWSCredentials(container.GetAccessKey(), container.GetSecretKey()),
            new AmazonS3Config
            {
                ServiceURL = container.GetConnectionString(),
                ForcePathStyle = true,
                AuthenticationRegion = "auto",
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
            });
        await client.PutBucketAsync(new PutBucketRequest { BucketName = Bucket });
        return new MinioFixture(container, client);
    }

    public async Task<bool> ExistsAsync(string key)
    {
        try
        {
            await Client.GetObjectMetadataAsync(Bucket, key);
            return true;
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<byte[]> ReadAsync(string key)
    {
        using var response = await Client.GetObjectAsync(Bucket, key);
        using var copy = new MemoryStream();
        await response.ResponseStream.CopyToAsync(copy);
        return copy.ToArray();
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await container.DisposeAsync();
    }
}
