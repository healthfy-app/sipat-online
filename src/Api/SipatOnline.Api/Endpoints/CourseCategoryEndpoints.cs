using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;

namespace SipatOnline.Api.Endpoints;

/// <summary>The subject areas of the library (Alimentação, Postura...) and the one a subject belongs to. Kept by the platform operator.</summary>
public static class CourseCategoryEndpoints
{
    private const int MaximumNameLength = 80;

    public static IEndpointRouteBuilder MapCourseCategoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/platform/catalog")
            .WithTags("Course categories")
            .RequireAuthorization("ManagePlatform");

        group.MapGet("/categories", async (PlatformDbContext db, CancellationToken token) =>
            Results.Ok(await ListAsync(db, token)))
            .WithName("ListCourseCategories");

        group.MapPost("/categories", async (CategoryRequest request, HttpContext context, IAntiforgery antiforgery, PlatformDbContext db, CancellationToken token) =>
        {
            if (await ValidateAsync(antiforgery, context) is { } invalid) return invalid;
            var name = Clean(request.Name);
            if (name is null) return Invalid("Informe o nome da categoria.");
            var existing = await db.CourseCategories.FirstOrDefaultAsync(item => item.Name.ToLower() == name.ToLower(), token);
            if (existing is not null) return Results.Ok(new CourseCategoryResponse(existing.Id, existing.Name, 0));
            var position = (await db.CourseCategories.MaxAsync(item => (int?)item.Position, token) ?? -1) + 1;
            var category = new CourseCategoryEntity { Id = Guid.NewGuid(), Name = name, Position = position, CreatedAt = DateTimeOffset.UtcNow };
            db.CourseCategories.Add(category);
            await db.SaveChangesAsync(token);
            return Results.Created($"/api/platform/catalog/categories/{category.Id:D}", new CourseCategoryResponse(category.Id, category.Name, 0));
        }).WithName("CreateCourseCategory");

        group.MapPut("/categories/{id:guid}", async (Guid id, CategoryRequest request, HttpContext context, IAntiforgery antiforgery, PlatformDbContext db, CancellationToken token) =>
        {
            if (await ValidateAsync(antiforgery, context) is { } invalid) return invalid;
            var name = Clean(request.Name);
            if (name is null) return Invalid("Informe o nome da categoria.");
            var category = await db.CourseCategories.FirstOrDefaultAsync(item => item.Id == id, token);
            if (category is null) return Results.NotFound();
            if (await db.CourseCategories.AnyAsync(item => item.Id != id && item.Name.ToLower() == name.ToLower(), token))
                return Invalid("Já existe uma categoria com esse nome.");
            category.Name = name;
            await db.SaveChangesAsync(token);
            return Results.NoContent();
        }).WithName("RenameCourseCategory");

        group.MapDelete("/categories/{id:guid}", async (Guid id, HttpContext context, IAntiforgery antiforgery, PlatformDbContext db, CancellationToken token) =>
        {
            if (await ValidateAsync(antiforgery, context) is { } invalid) return invalid;
            var category = await db.CourseCategories.FirstOrDefaultAsync(item => item.Id == id, token);
            if (category is null) return Results.NotFound();
            // subjects keep existing, just without a category
            await db.PlatformCourses.Where(course => course.CategoryId == id)
                .ExecuteUpdateAsync(set => set.SetProperty(course => course.CategoryId, (Guid?)null), token);
            db.CourseCategories.Remove(category);
            await db.SaveChangesAsync(token);
            return Results.NoContent();
        }).WithName("DeleteCourseCategory");

        group.MapPut("/courses/{courseId:guid}/category", async (Guid courseId, SetCategoryRequest request, HttpContext context, IAntiforgery antiforgery, PlatformDbContext db, CancellationToken token) =>
        {
            if (await ValidateAsync(antiforgery, context) is { } invalid) return invalid;
            var course = await db.PlatformCourses.FirstOrDefaultAsync(item => item.Id == courseId, token);
            if (course is null) return Results.NotFound();
            if (request.CategoryId is { } id && !await db.CourseCategories.AnyAsync(item => item.Id == id, token))
                return Invalid("A categoria escolhida não existe.");
            course.CategoryId = request.CategoryId;
            await db.SaveChangesAsync(token);
            return Results.NoContent();
        }).WithName("SetCourseCategory");

        return endpoints;
    }

    private static async Task<IReadOnlyList<CourseCategoryResponse>> ListAsync(PlatformDbContext db, CancellationToken token)
    {
        var counts = await db.PlatformCourses.AsNoTracking().Where(course => course.CategoryId != null)
            .GroupBy(course => course.CategoryId!.Value)
            .Select(group => new { Id = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Id, item => item.Count, token);
        var categories = await db.CourseCategories.AsNoTracking().OrderBy(item => item.Position).ThenBy(item => item.Name).ToListAsync(token);
        return categories.Select(item => new CourseCategoryResponse(item.Id, item.Name, counts.GetValueOrDefault(item.Id))).ToArray();
    }

    private static string? Clean(string? name)
    {
        var value = name?.Trim();
        return string.IsNullOrEmpty(value) ? null : value.Length > MaximumNameLength ? value[..MaximumNameLength] : value;
    }

    private static IResult Invalid(string detail) =>
        Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "learning.category.invalid", detail: detail);

    private static async Task<IResult?> ValidateAsync(IAntiforgery antiforgery, HttpContext context)
    {
        try
        {
            await antiforgery.ValidateRequestAsync(context);
            return null;
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Token antifalsificação inválido.");
        }
    }
}

public sealed record CategoryRequest(string? Name);

public sealed record SetCategoryRequest(Guid? CategoryId);
