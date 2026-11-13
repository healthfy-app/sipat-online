using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed class SipatProgramEntity
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    /// <summary>The days (title and course ids, in order) as JSON: a program is read and written whole.</summary>
    public string DaysJson { get; set; } = "[]";

    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class SipatProgramEntityConfiguration : Microsoft.EntityFrameworkCore.IEntityTypeConfiguration<SipatProgramEntity>
{
    public void Configure(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<SipatProgramEntity> builder)
    {
        builder.ToTable("SipatPrograms", "learning");
        builder.HasKey(program => program.Id);
        builder.Property(program => program.Id).ValueGeneratedNever();
        builder.Property(program => program.Title).HasMaxLength(200).IsRequired();
        builder.Property(program => program.DaysJson).IsRequired();
        builder.Property(program => program.CreatedAt).IsRequired();
    }
}

public sealed class EfSipatProgramStore(PlatformDbContext dbContext) : ISipatProgramStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<SipatProgram>> ListAsync(CancellationToken cancellationToken)
    {
        var programs = await dbContext.SipatPrograms.AsNoTracking()
            .OrderBy(program => program.Title).ThenBy(program => program.Id)
            .ToListAsync(cancellationToken);
        return programs.Select(ToDomain).ToArray();
    }

    public async Task<SipatProgram?> FindAsync(Guid programId, CancellationToken cancellationToken)
    {
        var program = await dbContext.SipatPrograms.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == programId, cancellationToken);
        return program is null ? null : ToDomain(program);
    }

    public async Task AddAsync(SipatProgram program, CancellationToken cancellationToken)
    {
        dbContext.SipatPrograms.Add(new SipatProgramEntity
        {
            Id = program.Id,
            Title = program.Title,
            DaysJson = JsonSerializer.Serialize(program.Days, JsonOptions),
            CreatedAt = program.CreatedAt
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> UpdateAsync(SipatProgram program, CancellationToken cancellationToken)
    {
        var entity = await dbContext.SipatPrograms.SingleOrDefaultAsync(item => item.Id == program.Id, cancellationToken);
        if (entity is null) return false;
        entity.Title = program.Title;
        entity.DaysJson = JsonSerializer.Serialize(program.Days, JsonOptions);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid programId, CancellationToken cancellationToken)
    {
        var entity = await dbContext.SipatPrograms.SingleOrDefaultAsync(item => item.Id == programId, cancellationToken);
        if (entity is null) return false;
        dbContext.SipatPrograms.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static SipatProgram ToDomain(SipatProgramEntity entity) => new(
        entity.Id,
        entity.Title,
        JsonSerializer.Deserialize<IReadOnlyList<ProgramDay>>(entity.DaysJson, JsonOptions) ?? [],
        entity.CreatedAt);
}
