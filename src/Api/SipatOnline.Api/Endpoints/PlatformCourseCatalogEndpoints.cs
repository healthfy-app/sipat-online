using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Api.Endpoints;

public static partial class PlatformCourseCatalogEndpoints
{
    public static IEndpointRouteBuilder MapPlatformCourseCatalogEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        var catalog = endpoints.MapGroup("/api/platform/catalog")
            .WithTags("Platform course catalog")
            .RequireAuthorization("ManagePlatform");

        catalog.MapGet("/courses", async (
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(ToResponse).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformCourses");

        catalog.MapPost("/courses", async (
            CreatePlatformCourseRequest request,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.CreateAsync(
                request.Title,
                request.Description,
                request.GamificationEnabled,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/courses/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreatePlatformCourse");

        catalog.MapPut("/courses/{courseId:guid}", async (
            Guid courseId,
            UpdatePlatformCourseRequest request,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            if (!Enum.TryParse<PlatformCourseStatus>(request.Status, true, out var status) ||
                !Enum.IsDefined(status))
            {
                return ToProblem(new DomainError(
                    "learning.platform_course.status_invalid",
                    "O status do curso é inválido."));
            }

            GamificationGameType? gameType = null;
            if (!string.IsNullOrWhiteSpace(request.GameType))
            {
                if (!Enum.TryParse<GamificationGameType>(request.GameType, true, out var parsedType) ||
                    !Enum.IsDefined(parsedType))
                {
                    return ToProblem(new DomainError(
                        "learning.platform_course.game_type_invalid",
                        "O tipo de jogo informado é inválido."));
                }

                gameType = parsedType;
            }

            var result = await catalogService.UpdateAsync(
                courseId,
                request.Title,
                request.Description,
                status,
                request.GamificationEnabled,
                gameType,
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("UpdatePlatformCourse");

        catalog.MapDelete("/courses/{courseId:guid}", async (
            Guid courseId,
            HttpContext context,
            PlatformCourseCatalogService courseService,
            SipatOnline.Infrastructure.PlatformDbContext db,
            CancellationToken cancellationToken) =>
        {
            // a company's training is its content: it leaves only with the training, from the company's own list
            if (await db.PlatformCourses.AnyAsync(course => course.Id == courseId && course.TenantId != null, cancellationToken))
                return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "learning.platform_course.company_training",
                    detail: "Este treinamento é de uma empresa. Cancele-o na tela de treinamentos da empresa.",
                    extensions: new Dictionary<string, object?> { ["code"] = "learning.platform_course.company_training" });
            var result = await courseService.DeleteCourseAsync(courseId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeletePlatformCourse");

        // the week copies of the SIPATs (trainings opened from a company's planner): Conteúdo hides them, the editor says whose week it is
        catalog.MapGet("/sipat-weeks", async (SipatOnline.Infrastructure.Learning.SipatPlanService plans, CancellationToken cancellationToken) =>
            Results.Ok(await plans.WeeksAsync(cancellationToken)))
        .WithName("ListSipatWeeks");

        // a model offered whole as a ready SIPAT: what a Bronze company picks its training from
        catalog.MapPut("/courses/{courseId:guid}/ready-sipat", async (
            Guid courseId, SetReadySipatRequest request, SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var course = await db.PlatformCourses.SingleOrDefaultAsync(item => item.Id == courseId, cancellationToken);
            if (course is null) return Results.NotFound();
            if (course.TenantId is not null)
                return Results.Problem(statusCode: StatusCodes.Status409Conflict, title: "learning.platform_course.company_training",
                    detail: "Só um modelo do Conteúdo pode ser oferecido como SIPAT pronta.",
                    extensions: new Dictionary<string, object?> { ["code"] = "learning.platform_course.company_training" });
            course.IsReadySipat = request.Ready;
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        })
        .WithName("SetPlatformCourseReadySipat");

        // assunto is a classification of the videos (like a genre): a video can be in several, from the operator's fixed list
        catalog.MapGet("/subjects", async (SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
            Results.Ok(await db.VideoSubjects.AsNoTracking().OrderBy(item => item.Name)
                .Select(item => new VideoSubjectResponse(item.Id, item.Name)).ToArrayAsync(cancellationToken)))
        .WithName("ListSubjects");

        // a new assunto for the list; a name already there (ignoring case) gives back that one instead of a twin
        catalog.MapPost("/subjects", async (CreateSubjectRequest request, SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var name = string.Join(' ', (request.Name ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries));
            if (name.Length == 0)
                return Results.Problem(statusCode: 400, title: "catalog.subject_name_required", detail: "Escreva o nome do assunto.");
            if (name.Length > 200)
                return Results.Problem(statusCode: 400, title: "catalog.subject_name_too_long", detail: "O nome do assunto pode ter até 200 letras.");
            var existing = await db.VideoSubjects.AsNoTracking()
                .FirstOrDefaultAsync(item => item.Name.ToLower() == name.ToLower(), cancellationToken);
            if (existing is not null)
                return Results.Ok(new VideoSubjectResponse(existing.Id, existing.Name));
            var subject = new VideoSubjectEntity { Id = Guid.NewGuid(), Name = name };
            db.VideoSubjects.Add(subject);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Created($"/api/platform/catalog/subjects/{subject.Id}", new VideoSubjectResponse(subject.Id, subject.Name));
        })
        .WithName("CreateSubject");

        // the assunto leaves the list and every video that was in it; the videos themselves stay
        catalog.MapDelete("/subjects/{subjectId:guid}", async (Guid subjectId, SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var subject = await db.VideoSubjects.FirstOrDefaultAsync(item => item.Id == subjectId, cancellationToken);
            if (subject is null)
                return Results.NotFound();
            db.VideoSubjectLinks.RemoveRange(await db.VideoSubjectLinks.Where(link => link.SubjectId == subjectId).ToListAsync(cancellationToken));
            db.VideoSubjects.Remove(subject);
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteSubject");

        catalog.MapGet("/video-subjects", async (SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
            Results.Ok(await VideoSubjectMapAsync(db, cancellationToken)))
        .WithName("ListVideoSubjects");

        catalog.MapPut("/videos/{videoId:guid}/subjects", async (
            Guid videoId,
            SetVideoSubjectsRequest request,
            SipatOnline.Infrastructure.PlatformDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!await db.PlatformCourseVideos.AnyAsync(video => video.Id == videoId, cancellationToken))
                return Results.NotFound();
            var wanted = (request.SubjectIds ?? []).Distinct().ToHashSet();
            if (await db.VideoSubjects.CountAsync(item => wanted.Contains(item.Id), cancellationToken) != wanted.Count)
                return Results.Problem(statusCode: 400, title: "catalog.subject_not_found", detail: "Um dos assuntos não foi encontrado.");
            var current = await db.VideoSubjectLinks.Where(link => link.VideoId == videoId).ToListAsync(cancellationToken);
            db.VideoSubjectLinks.RemoveRange(current.Where(link => !wanted.Contains(link.SubjectId)));
            foreach (var subjectId in wanted.Where(id => current.All(link => link.SubjectId != id)))
                db.VideoSubjectLinks.Add(new VideoSubjectLinkEntity { SubjectId = subjectId, VideoId = videoId });
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(new VideoSubjectsResponse(videoId, wanted.ToArray()));
        })
        .WithName("SetVideoSubjects");

        // many videos at once: the checked assuntos are added, the unchecked ones removed, the rest stays as it was
        catalog.MapPut("/videos/subjects", async (BulkVideoChangeRequest request, SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var videoIds = request.VideoIds.Distinct().ToArray();
            var add = request.Add.Distinct().ToArray();
            if (await db.VideoSubjects.CountAsync(item => add.Contains(item.Id), cancellationToken) != add.Length)
                return Results.Problem(statusCode: 400, title: "catalog.subject_not_found", detail: "Um dos assuntos não foi encontrado.");
            var existing = await db.PlatformCourseVideos.Where(video => videoIds.Contains(video.Id)).Select(video => video.Id).ToListAsync(cancellationToken);
            var links = await db.VideoSubjectLinks.Where(link => existing.Contains(link.VideoId)).ToListAsync(cancellationToken);
            db.VideoSubjectLinks.RemoveRange(links.Where(link => request.Remove.Contains(link.SubjectId)));
            foreach (var subjectId in add)
                foreach (var videoId in existing.Where(id => !links.Any(link => link.VideoId == id && link.SubjectId == subjectId)))
                    db.VideoSubjectLinks.Add(new VideoSubjectLinkEntity { SubjectId = subjectId, VideoId = videoId });
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        })
        .WithName("ChangeVideosSubjects");

        // a video with companies is private to them; with none it is public
        catalog.MapGet("/video-companies", async (SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var rows = await db.CompanyVideos.AsNoTracking().ToListAsync(cancellationToken);
            return Results.Ok(rows.GroupBy(row => row.VideoId)
                .Select(group => new VideoCompaniesResponse(group.Key, group.Select(row => row.TenantId).ToArray())).ToArray());
        })
        .WithName("ListVideoCompanies");

        catalog.MapPut("/videos/companies", async (BulkVideoChangeRequest request, SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken) =>
        {
            var videoIds = request.VideoIds.Distinct().ToArray();
            var add = request.Add.Distinct().ToArray();
            if (await db.Tenants.CountAsync(tenant => add.Contains(tenant.Id), cancellationToken) != add.Length)
                return Results.Problem(statusCode: 400, title: "catalog.company_not_found", detail: "Uma das empresas não foi encontrada.");
            var existing = await db.PlatformCourseVideos.Where(video => videoIds.Contains(video.Id)).Select(video => video.Id).ToListAsync(cancellationToken);
            var rows = await db.CompanyVideos.Where(row => existing.Contains(row.VideoId)).ToListAsync(cancellationToken);
            db.CompanyVideos.RemoveRange(rows.Where(row => request.Remove.Contains(row.TenantId)));
            foreach (var videoId in existing)
                foreach (var tenantId in add.Where(id => !rows.Any(row => row.VideoId == videoId && row.TenantId == id)))
                    db.CompanyVideos.Add(new SipatOnline.Infrastructure.Tenancy.CompanyVideoEntity { VideoId = videoId, TenantId = tenantId });
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        })
        .WithName("ChangeVideosCompanies");

        catalog.MapDelete("/videos/{videoId:guid}", async (
            Guid videoId,
            HttpContext context,
            PlatformCourseCatalogService courseService,
            CancellationToken cancellationToken) =>
        {
            var result = await courseService.DeleteVideoAsync(videoId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeletePlatformVideo");

        catalog.MapPost("/courses/{courseId:guid}/duplicate", async (
            Guid courseId,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.DuplicateAsync(courseId, cancellationToken);
            return result.IsSuccess
                ? Results.Created(
                    $"/api/platform/catalog/courses/{result.Value.Id:D}",
                    ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("DuplicatePlatformCourse");

        catalog.MapPut("/courses/{courseId:guid}/videos", async (
            Guid courseId,
            SetPlatformCourseVideosRequest request,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.SetVideosAsync(courseId, request.VideoIds, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetPlatformCourseVideos");

        catalog.MapPut("/courses/{courseId:guid}/structure", async (
            Guid courseId,
            SetPlatformCourseStructureRequest request,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var lessons = request.Lessons?
                .Select(item => new CourseLessonDraft(
                    item.Id,
                    item.Title ?? string.Empty,
                    item.Description,
                    (item.Videos ?? []).Select(video => new CourseLessonVideoDraft(video.VideoId, video.Title)).ToArray()))
                .ToArray();
            var result = await catalogService.SetStructureAsync(courseId, lessons, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetPlatformCourseStructure");

        catalog.MapPut("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var form = await context.Request.ReadFormAsync(cancellationToken);
            var file = form.Files.GetFile("cover");
            if (file is null)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Selecione uma foto para o curso.");
            }

            await using var stream = file.OpenReadStream();
            var result = await catalogService.SetCoverAsync(
                courseId, file.ContentType, stream, file.Length, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithMetadata(new RequestSizeLimitAttribute(PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumCoverSizeBytes + 1_048_576
        })
        .WithName("SetPlatformCourseCover");

        catalog.MapDelete("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.RemoveCoverAsync(courseId, cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("RemovePlatformCourseCover");

        catalog.MapGet("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.GetCoverAsync(courseId, cancellationToken);
            return result.IsSuccess
                ? Results.File(result.Value.Data, result.Value.ContentType)
                : ToProblem(result.Error);
        })
        .WithName("GetPlatformCourseCover");

        catalog.MapGet("/videos", async (
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListVideosAsync(cancellationToken);
            return result.IsSuccess
                ? Results.Ok(result.Value.Select(item => new PlatformLibraryVideoResponse(
                    ToResponse(item.Video),
                    item.CourseCount)).ToArray())
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformLibraryVideos");

        catalog.MapPost("/videos", (
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
            UploadVideoAsync(null, context, catalogService, cancellationToken))
        .WithMetadata(new RequestSizeLimitAttribute(
            PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576
        })
        .WithName("UploadPlatformLibraryVideo");

        catalog.MapPost("/videos/uploads", async (
            StartPlatformVideoUploadRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.StartDirectUploadAsync(
                request.ContentType,
                request.SizeBytes,
                cancellationToken);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            if (result.Value.Ticket is not { } ticket)
            {
                return Results.Ok(new MultipartVideoUploadResponse(
                    DirectUploadStart.Multipart,
                    PlatformCourseCatalogService.MaximumVideoSizeBytes));
            }

            return Results.Ok(new DirectVideoUploadResponse(
                DirectUploadStart.Direct,
                ticket.VideoId,
                ticket.UploadUrl.AbsoluteUri,
                "PUT",
                new Dictionary<string, string> { ["Content-Type"] = ticket.ContentType },
                ticket.ExpiresAt,
                PlatformCourseCatalogService.MaximumVideoSizeBytes));
        })
        .WithName("StartPlatformVideoUpload");

        catalog.MapPost("/videos/uploads/{videoId:guid}/complete", async (
            Guid videoId,
            CompletePlatformVideoUploadRequest request,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.CompleteDirectUploadAsync(
                videoId,
                request.CourseId,
                request.Title,
                request.DurationMilliseconds,
                cancellationToken);
            return CreatedVideo(result, context);
        })
        .WithName("CompletePlatformVideoUpload");

        // Chunked upload: the browser sends the file in parts straight to the bucket and, after a lost connection
        // or a reload, asks which parts are there and sends only the rest. Then finish joins them and complete
        // (above) checks and registers the video.
        catalog.MapPost("/videos/uploads/chunked", async (
            StartPlatformVideoUploadRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.StartChunkedUploadAsync(
                request.ContentType, request.SizeBytes, cancellationToken, request.Title, request.DurationMilliseconds);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            return result.Value.Ticket is not { } start
                ? Results.Ok(new MultipartVideoUploadResponse(DirectUploadStart.Multipart, PlatformCourseCatalogService.MaximumVideoSizeBytes))
                : Results.Ok(new ChunkedVideoUploadResponse(
                    "chunked",
                    start.VideoId,
                    start.UploadId,
                    start.PartSizeBytes,
                    start.PartCount,
                    PlatformCourseCatalogService.MaximumSignedPartsPerCall,
                    PlatformCourseCatalogService.MaximumVideoSizeBytes));
        })
        .WithName("StartPlatformChunkedVideoUpload");

        catalog.MapPost("/videos/uploads/{videoId:guid}/parts", (
            Guid videoId,
            SignChunkedUploadPartsRequest request,
            PlatformCourseCatalogService catalogService) =>
        {
            var result = catalogService.SignChunkedUploadParts(videoId, request.UploadId, request.PartNumbers);
            return result.IsSuccess
                ? Results.Ok(new SignedUploadPartsResponse(result.Value
                    .Select(part => new SignedUploadPartResponse(part.PartNumber, part.UploadUrl.AbsoluteUri))
                    .ToArray()))
                : ToProblem(result.Error);
        })
        .WithName("SignPlatformChunkedVideoUploadParts");

        catalog.MapPost("/videos/uploads/{videoId:guid}/parts/list", async (
            Guid videoId,
            ChunkedUploadRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.ListChunkedUploadPartsAsync(videoId, request.UploadId, cancellationToken);
            return result.IsSuccess
                ? Results.Ok(new StoredUploadPartsResponse(result.Value
                    .Select(part => new StoredUploadPartResponse(part.PartNumber, part.SizeBytes))
                    .ToArray()))
                : ToProblem(result.Error);
        })
        .WithName("ListPlatformChunkedVideoUploadParts");

        catalog.MapPost("/videos/uploads/{videoId:guid}/finish", async (
            Guid videoId,
            ChunkedUploadRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.FinishChunkedUploadAsync(videoId, request.UploadId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("FinishPlatformChunkedVideoUpload");

        catalog.MapPost("/videos/uploads/{videoId:guid}/abort", async (
            Guid videoId,
            ChunkedUploadRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.AbortChunkedUploadAsync(videoId, request.UploadId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("AbortPlatformChunkedVideoUpload");

        catalog.MapPost("/videos/external", async (
            CreateExternalVideoRequest request,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            var result = await catalogService.CreateExternalVideoAsync(
                request.Provider,
                request.Url,
                request.Title,
                request.DurationMilliseconds,
                cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/platform/catalog/videos/{result.Value.Id:D}", ToResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreatePlatformExternalVideo");

        catalog.MapPost("/courses/{courseId:guid}/videos", (
            Guid courseId,
            HttpContext context,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
            UploadVideoAsync(courseId, context, catalogService, cancellationToken))
        .WithMetadata(new RequestSizeLimitAttribute(
            PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576))
        .WithMetadata(new RequestFormLimitsAttribute
        {
            MultipartBodyLengthLimit = PlatformCourseCatalogService.MaximumVideoSizeBytes + 1_048_576
        })
        .WithName("UploadPlatformCourseVideo");

        catalog.MapGet("/videos/{videoId:guid}/file", async (
            Guid videoId,
            string? quality,
            PlatformCourseCatalogService catalogService,
            CancellationToken cancellationToken) =>
        {
            // the previews offer the versions a participant gets: ?quality=1080p, 720p (none) or 480p
            if (VideoRenditions.FromQuality(quality) is not { } rendition)
            {
                return Results.NotFound();
            }

            var result = await catalogService.GetVideoFileAsync(videoId, cancellationToken, rendition);
            if (!result.IsSuccess)
            {
                return ToProblem(result.Error);
            }

            if (result.Value.RedirectTo is { } link)
            {
                return Results.Redirect(link.AbsoluteUri);
            }

            return Results.File(
                result.Value.Content!,
                result.Value.ContentType,
                enableRangeProcessing: true);
        })
        .WithName("StreamPlatformCourseVideo");

        catalog.MapGet("/modules", async (
            GameModuleService moduleService,
            SipatOnline.Infrastructure.PlatformDbContext db,
            CancellationToken cancellationToken) =>
        {
            var result = await moduleService.ListAsync(cancellationToken);
            if (!result.IsSuccess) return ToProblem(result.Error);
            // the operation sees every game, the companies' own too, and whose each is
            var owners = result.Value.Select(item => item.Module.TenantId).OfType<Guid>().Distinct().ToArray();
            var names = owners.Length == 0
                ? new Dictionary<Guid, string>()
                : await db.Tenants.AsNoTracking().Where(tenant => owners.Contains(tenant.Id)).ToDictionaryAsync(tenant => tenant.Id, tenant => tenant.Name, cancellationToken);
            return Results.Ok(result.Value.Select(item => ToResponse(item.Module, item.UsageCount) with
            {
                CompanyName = item.Module.TenantId is { } owner ? names.GetValueOrDefault(owner) : null,
            }).ToArray());
        })
        .WithName("ListGameModules");

        catalog.MapPost("/modules", async (
            SaveGameModuleRequest request,
            HttpContext context,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            if (!TryParseGameType(request.GameType, out var gameType))
            {
                return ToProblem(GameTypeInvalid);
            }

            var result = await moduleService.CreateAsync(
                request.Title, gameType, ToQuestions(request.Questions), cancellationToken, request.Content);
            return result.IsSuccess
                ? Results.Created($"/api/platform/catalog/modules/{result.Value.Id:D}", ToResponse(result.Value, 0))
                : ToProblem(result.Error);
        })
        .WithName("CreateGameModule");

        catalog.MapPut("/modules/{moduleId:guid}", async (
            Guid moduleId,
            SaveGameModuleRequest request,
            HttpContext context,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            if (!TryParseGameType(request.GameType, out var gameType))
            {
                return ToProblem(GameTypeInvalid);
            }

            var result = await moduleService.UpdateAsync(
                moduleId, request.Title, gameType, ToQuestions(request.Questions), cancellationToken, request.Content);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value, 0)) : ToProblem(result.Error);
        })
        .WithName("UpdateGameModule");

        catalog.MapDelete("/modules/{moduleId:guid}", async (
            Guid moduleId,
            HttpContext context,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var result = await moduleService.DeleteAsync(moduleId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteGameModule");

        catalog.MapGet("/programs", async (
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var result = await programService.ListAsync(cancellationToken);
            return result.IsSuccess ? Results.Ok(result.Value.Select(ToProgramResponse).ToArray()) : ToProblem(result.Error);
        })
        .WithName("ListSipatPrograms");

        catalog.MapPost("/programs", async (
            SaveProgramRequest request,
            HttpContext context,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var result = await programService.CreateAsync(request.Title, ToProgramDays(request.Days), cancellationToken);
            return result.IsSuccess
                ? Results.Created($"/api/platform/catalog/programs/{result.Value.Id:D}", ToProgramResponse(result.Value))
                : ToProblem(result.Error);
        })
        .WithName("CreateSipatProgram");

        catalog.MapPut("/programs/{programId:guid}", async (
            Guid programId,
            SaveProgramRequest request,
            HttpContext context,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var result = await programService.UpdateAsync(programId, request.Title, ToProgramDays(request.Days), cancellationToken);
            return result.IsSuccess ? Results.Ok(ToProgramResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("UpdateSipatProgram");

        catalog.MapDelete("/programs/{programId:guid}", async (
            Guid programId,
            HttpContext context,
            SipatProgramService programService,
            CancellationToken cancellationToken) =>
        {
            var result = await programService.DeleteAsync(programId, cancellationToken);
            return result.IsSuccess ? Results.NoContent() : ToProblem(result.Error);
        })
        .WithName("DeleteSipatProgram");

        catalog.MapPut("/courses/{courseId:guid}/modules", async (
            Guid courseId,
            SetCourseModulesRequest request,
            HttpContext context,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var result = await moduleService.SetCourseModulesAsync(
                courseId,
                request.Items?.Select(item => new CourseModulePlacement(item.ModuleId, item.AfterVideoCount)).ToArray(),
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetCourseModules");

        // the games in the middle of a video belong to the training: the same video elsewhere keeps its own
        catalog.MapPut("/courses/{courseId:guid}/videos/{videoId:guid}/checkpoints", async (
            Guid courseId,
            Guid videoId,
            SetVideoCheckpointsRequest request,
            HttpContext context,
            GameModuleService moduleService,
            CancellationToken cancellationToken) =>
        {
            var result = await moduleService.SetVideoCheckpointsAsync(
                courseId,
                videoId,
                request.Items?.Select(item => new VideoCheckpoint(item.TimeMilliseconds, item.ModuleId)).ToArray(),
                cancellationToken);
            return result.IsSuccess ? Results.Ok(ToResponse(result.Value)) : ToProblem(result.Error);
        })
        .WithName("SetVideoCheckpoints");
        return endpoints;
    }

    /// <summary>Which assuntos each plan can use, for the operator: everything is available unless taken out.</summary>
    public static IEndpointRouteBuilder MapPlanSubjectEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/platform/catalog/plan-subjects")
            .WithTags("Plan subjects")
            .RequireAuthorization("ManagePlatform");

        group.MapGet("/", async (
            IPlatformCourseCatalogStore courses,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            CancellationToken cancellationToken) =>
        {
            var owners = await plans.CompanySubjectsAsync(cancellationToken);
            var published = (await courses.ListAsync(cancellationToken))
                .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0)
                .Select(course => new PlanSubjectCourse(course.Id, course.Title, course.Description, course.Videos.Count, course.CategoryId, owners.TryGetValue(course.Id, out var owner) ? owner : null))
                .ToArray();
            var excluded = new Dictionary<string, IReadOnlyList<Guid>>();
            foreach (var plan in Enum.GetValues<SipatOnline.Infrastructure.Tenancy.CompanyPlan>())
            {
                excluded[plan.ToString()] = (await plans.ExcludedSubjectsAsync(plan, cancellationToken)).ToArray();
            }

            return Results.Ok(new PlanSubjectsResponse(published, excluded));
        })
        .WithName("GetPlanSubjects");

        group.MapPut("/{plan}", async (
            string plan,
            SetPlanSubjectsRequest request,
            HttpContext context,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            CancellationToken cancellationToken) =>
        {
            if (!SipatOnline.Infrastructure.Tenancy.CompanyPlans.TryParse(plan, out var parsed))
            {
                return Results.Problem(statusCode: 400, title: "tenant.plan.invalid", detail: "Escolha um plano válido: Bronze, Prata, Ouro ou Diamante.");
            }

            var result = await plans.SetExcludedSubjectsAsync(parsed, request.ExcludedCourseIds ?? [], cancellationToken);
            return result.IsSuccess
                ? Results.NoContent()
                : Results.Problem(statusCode: 403, title: result.Error.Code, detail: result.Error.Message);
        })
        .WithName("SetPlanSubjects");

        // an assunto with a company's internal videos: only that company sees it, and only on Diamante
        group.MapPut("/courses/{courseId:guid}/company", async (
            Guid courseId,
            SetSubjectCompanyRequest request,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            CancellationToken cancellationToken) =>
        {
            var result = await plans.SetSubjectCompanyAsync(courseId, request.CompanyId, cancellationToken);
            return result.IsSuccess
                ? Results.NoContent()
                : Results.Problem(statusCode: result.Error.Code.EndsWith("not_found", StringComparison.Ordinal) ? 404 : 403, title: result.Error.Code, detail: result.Error.Message);
        })
        .WithName("SetSubjectCompany");

        return endpoints;
    }

    /// <summary>The catalog as the company's administrator sees it: what a day of a SIPAT can be made of, read only.</summary>
    public static IEndpointRouteBuilder MapSipatCatalogEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/sipat-catalog")
            .WithTags("SIPAT catalog")
            .RequireAuthorization("ManageTenantSipats");

        group.MapGet("/", async (
            IPlatformCourseCatalogStore courses,
            IGameModuleStore modules,
            SipatOnline.Infrastructure.Tenancy.TenantPlanService plans,
            SipatOnline.Infrastructure.PlatformDbContext db,
            SipatOnline.Infrastructure.Learning.SipatPlanService sipatPlans,
            SipatOnline.BuildingBlocks.Application.ITenantContext tenantContext,
            CancellationToken cancellationToken) =>
        {
            var capabilities = await plans.CapabilitiesAsync(cancellationToken);
            // the assuntos of its plan, without other companies' own ones; its own (internal videos) only on Diamante
            var excluded = await plans.HiddenSubjectsAsync(cancellationToken);
            // a SIPAT's week copy is that SIPAT's days, never something to start another from
            var weeks = await sipatPlans.WeekCourseIdsAsync(cancellationToken);
            var allCourses = await courses.ListAsync(cancellationToken);
            var themes = allCourses
                .Where(course => course.Status == PlatformCourseStatus.Published && course.Videos.Count > 0)
                .Where(course => !excluded.Contains(course.Id) && !weeks.Contains(course.Id))
                .Select(course => ToResponse(course) with
                {
                    CoverUrl = course.CoverContentType is null
                        ? null
                        : $"/api/admin/sipat-catalog/courses/{course.Id:D}/cover?v={course.CoverUpdatedAt?.ToUnixTimeMilliseconds()}"
                })
                .ToArray();
            var offered = themes.SelectMany(theme => theme.Videos.Select(video => video.Id)).ToHashSet();
            // the library's standalone videos are offered too; only those of an assunto the company cannot use stay out
            var blocked = allCourses.Where(course => excluded.Contains(course.Id))
                .SelectMany(course => course.Videos.Select(video => video.Id)).ToHashSet();
            var privateToOthers = await plans.HiddenVideosAsync(cancellationToken);
            var videos = (await courses.ListVideosAsync(cancellationToken))
                .Where(item => offered.Contains(item.Video.Id) || !blocked.Contains(item.Video.Id))
                .Where(item => !privateToOthers.Contains(item.Video.Id))
                .Select(item => new PlatformLibraryVideoResponse(ToResponse(item.Video), item.CourseCount))
                .ToArray();
            var games = capabilities.Quizzes
                // the operation's games and the company's own, never another company's
                ? (await modules.ListAsync(cancellationToken)).Where(item => item.Module.TenantId is null || item.Module.TenantId == tenantContext.CurrentTenantId?.Value)
                    .Select(item => ToResponse(item.Module, item.UsageCount)).ToArray()
                : [];
            var categories = await db.CourseCategories.AsNoTracking().OrderBy(item => item.Position).ThenBy(item => item.Name)
                .Select(item => new CourseCategoryResponse(item.Id, item.Name, 0)).ToArrayAsync(cancellationToken);
            var subjects = await db.VideoSubjects.AsNoTracking().OrderBy(item => item.Name)
                .Select(item => new VideoSubjectResponse(item.Id, item.Name)).ToArrayAsync(cancellationToken);
            return Results.Ok(new SipatCatalogResponse(themes, videos, games, categories, subjects, await VideoSubjectMapAsync(db, cancellationToken)));
        })
        .WithName("GetSipatCatalog");

        group.MapGet("/courses/{courseId:guid}/cover", async (
            Guid courseId,
            IPlatformCourseCatalogStore courses,
            CancellationToken cancellationToken) =>
        {
            var cover = await courses.GetCoverAsync(courseId, cancellationToken);
            return cover is null ? Results.NotFound() : Results.File(cover.Data, cover.ContentType);
        })
        .WithName("GetSipatCatalogCover");

        return endpoints;
    }

    private static async Task<IResult> UploadVideoAsync(
        Guid? courseId,
        HttpContext context,
        PlatformCourseCatalogService catalogService,
        CancellationToken cancellationToken)
    {
        var form = await context.Request.ReadFormAsync(cancellationToken);
        var file = form.Files.GetFile("video");
        if (file is null)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Selecione um arquivo de vídeo.");
        }

        if (!long.TryParse(
                form["durationMilliseconds"],
                NumberStyles.None,
                CultureInfo.InvariantCulture,
                out var durationMilliseconds))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Informe a duração do vídeo em milissegundos.");
        }

        await using var stream = file.OpenReadStream();
        var result = await catalogService.AddVideoAsync(
            courseId,
            form["title"],
            durationMilliseconds,
            stream,
            file.ContentType,
            file.Length,
            cancellationToken);
        return CreatedVideo(result, context);
    }

    private static IResult CreatedVideo(Result<PlatformCourseVideo> result, HttpContext context)
    {
        if (!result.IsSuccess)
        {
            return ToProblem(result.Error);
        }

        if (result.Value.Status == PlatformVideoStatus.Processing)
        {
            // The queue row is committed by now: wake the worker instead of waiting for its next poll.
            context.RequestServices.GetRequiredService<VideoConversionSignal>().Notify();
        }

        return Results.Created(
            $"/api/platform/catalog/videos/{result.Value.Id:D}/file",
            ToResponse(result.Value));
    }

    private static PlatformCourseResponse ToResponse(PlatformCourse course) =>
        new(
            course.Id,
            course.Title,
            course.Description,
            course.CreatedAt,
            course.Status.ToString(),
            course.GamificationEnabled,
            course.Videos.Select(ToResponse).ToArray(),
            course.GameType.ToString(),
            course.Modules.Select(item => new CourseModulePlacementDto(item.ModuleId, item.AfterVideoCount)).ToArray(),
            course.CoverContentType is null
                ? null
                : $"/api/platform/catalog/courses/{course.Id:D}/cover?v={course.CoverUpdatedAt?.ToUnixTimeMilliseconds()}",
            (course.Lessons ?? [])
                .Select(lesson => new PlatformCourseLessonDto(lesson.Id, lesson.Title, lesson.Description, lesson.VideoIds))
                .ToArray(),
            course.CategoryId,
            course.TenantId,
            course.IsReadySipat);

    private static PlatformCourseVideoResponse ToResponse(PlatformCourseVideo video) =>
        new(
            video.Id,
            video.Title,
            video.ContentType,
            video.SizeBytes,
            video.DurationMilliseconds,
            video.CreatedAt,
            video.Provider == VideoProvider.Sipat ? $"/api/platform/catalog/videos/{video.Id:D}/file" : string.Empty,
            video.Checkpoints.Select(item => new VideoCheckpointDto(item.TimeMilliseconds, item.ModuleId)).ToArray(),
            video.LessonId,
            video.LibraryTitle,
            video.Status.ToString(),
            video.ProcessingError,
            video.HasSd480,
            video.Provider.ToString(),
            video.ExternalId,
            video.HasFhd1080,
            video.ThumbnailUpdatedAt is { } thumbnail ? $"/api/platform/catalog/videos/{video.Id:D}/thumbnail?v={thumbnail.ToUnixTimeMilliseconds()}" : null);

    private static readonly DomainError GameTypeInvalid = new(
        "learning.platform_course.game_type_invalid",
        "O tipo de jogo informado é inválido.");

    private static bool TryParseGameType(string? value, out GamificationGameType gameType) =>
        Enum.TryParse(value, true, out gameType) && Enum.IsDefined(gameType);

    private static IReadOnlyList<GameQuestion>? ToQuestions(IReadOnlyList<GameQuestionDto>? questions) =>
        questions?.Select(item => new GameQuestion(item.Text ?? string.Empty, item.Options ?? [], item.CorrectIndex)).ToArray();

    private static ProgramResponse ToProgramResponse(SipatProgram program) =>
        new(program.Id, program.Title, program.Days.Select(day => new ProgramDayDto(day.Id, day.Title, day.Date, day.Subject, day.VideoIds, day.GameIds)).ToArray(), program.CreatedAt);

    private static IReadOnlyList<ProgramDay>? ToProgramDays(IReadOnlyList<ProgramDayDto>? days) =>
        days?.Select(day => new ProgramDay(day.Id ?? Guid.Empty, day.Title ?? string.Empty, day.Date, day.Subject, day.VideoIds ?? [], day.GameIds ?? [])).ToArray();

    private static GameModuleResponse ToResponse(GameModule module, int usageCount) =>
        new(
            module.Id,
            module.Title,
            module.GameType.ToString(),
            module.Questions.Select(item => new GameQuestionDto(item.Text, item.Options, item.CorrectIndex)).ToArray(),
            module.CreatedAt,
            usageCount,
            module.Content,
            module.TenantId);

    private static async Task<VideoSubjectsResponse[]> VideoSubjectMapAsync(SipatOnline.Infrastructure.PlatformDbContext db, CancellationToken cancellationToken)
    {
        var links = await db.VideoSubjectLinks.AsNoTracking().ToListAsync(cancellationToken);
        return links.GroupBy(link => link.VideoId)
            .Select(group => new VideoSubjectsResponse(group.Key, group.Select(link => link.SubjectId).ToArray())).ToArray();
    }

    private static IResult ToProblem(DomainError error)
    {
        var statusCode = error.Code switch
        {
            "learning.platform_course.forbidden" => StatusCodes.Status403Forbidden,
            "learning.platform_course.not_found" or
                "learning.game_module.not_found" or
                "learning.program.not_found" or
                "learning.program.video_not_found" or
                "learning.program.game_not_found" or
                "learning.platform_course.cover_not_found" or
                "learning.platform_course.video_not_found" or
                "learning.platform_course.upload_not_found" => StatusCodes.Status404NotFound,
            "learning.platform_course.storage_unconfigured" or
                "learning.platform_course.video_file_missing" => StatusCodes.Status503ServiceUnavailable,
            "learning.platform_course.actor_required" => StatusCodes.Status400BadRequest,
            "learning.platform_course.video_in_use" or
                "learning.catalog.external_no_checkpoints" or
                "learning.platform_course.video_processing" or
                "learning.platform_course.video_failed" or
                "learning.platform_course.upload_already_completed" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };

        return Results.Problem(
            statusCode: statusCode,
            title: error.Code,
            detail: error.Message,
            extensions: new Dictionary<string, object?> { ["code"] = error.Code });
    }

}

public sealed record SetReadySipatRequest(bool Ready);

public sealed record CreatePlatformCourseRequest(
    string? Title,
    string? Description,
    bool GamificationEnabled = false);

public sealed record UpdatePlatformCourseRequest(
    string? Title,
    string? Description,
    string? Status,
    bool GamificationEnabled,
    string? GameType = null);

public sealed record SetPlatformCourseVideosRequest(IReadOnlyList<Guid>? VideoIds);

public sealed record StartPlatformVideoUploadRequest(
    string? ContentType,
    long SizeBytes,
    string? Title = null,
    long? DurationMilliseconds = null);

public sealed record CompletePlatformVideoUploadRequest(string? Title, long DurationMilliseconds, Guid? CourseId);

/// <summary>The browser sends the file in the API's multipart form.</summary>
public sealed record MultipartVideoUploadResponse(string Mode, long MaxSizeBytes);

/// <summary>The browser PUTs the file to <see cref="UploadUrl"/> with exactly <see cref="Headers"/>, then calls complete.</summary>
public sealed record DirectVideoUploadResponse(
    string Mode,
    Guid VideoId,
    string UploadUrl,
    string Method,
    IReadOnlyDictionary<string, string> Headers,
    DateTimeOffset ExpiresAt,
    long MaxSizeBytes);

/// <summary>The browser sends parts of <see cref="PartSizeBytes"/> (the last one smaller), asking for links in batches.</summary>
public sealed record ChunkedVideoUploadResponse(
    string Mode,
    Guid VideoId,
    string UploadId,
    long PartSizeBytes,
    int PartCount,
    int MaxPartsPerRequest,
    long MaxSizeBytes);

public sealed record ChunkedUploadRequest(string? UploadId);

public sealed record SignChunkedUploadPartsRequest(string? UploadId, IReadOnlyList<int>? PartNumbers);

public sealed record SignedUploadPartResponse(int PartNumber, string Url);

public sealed record SignedUploadPartsResponse(IReadOnlyList<SignedUploadPartResponse> Parts);

public sealed record StoredUploadPartResponse(int PartNumber, long SizeBytes);

public sealed record StoredUploadPartsResponse(IReadOnlyList<StoredUploadPartResponse> Parts);

public sealed record PlatformLibraryVideoResponse(PlatformCourseVideoResponse Video, int CourseCount);

public sealed record VideoSubjectsResponse(Guid VideoId, Guid[] SubjectIds);

public sealed record SetVideoSubjectsRequest(Guid[]? SubjectIds);

public sealed record CreateSubjectRequest(string? Name);

public sealed record VideoCompaniesResponse(Guid VideoId, Guid[] CompanyIds);

public sealed record BulkVideoChangeRequest(Guid[] VideoIds, Guid[] Add, Guid[] Remove);

public sealed record PlanSubjectsResponse(IReadOnlyList<PlanSubjectCourse> Courses, IReadOnlyDictionary<string, IReadOnlyList<Guid>> Excluded);

/// <summary>An assunto of the catalog; CompanyId is set when it belongs to one company (its internal videos).</summary>
public sealed record PlanSubjectCourse(Guid Id, string Title, string? Description, int VideoCount, Guid? CategoryId = null, Guid? CompanyId = null);

public sealed record SetSubjectCompanyRequest(Guid? CompanyId);

public sealed record SetPlanSubjectsRequest(IReadOnlyList<Guid>? ExcludedCourseIds);

public sealed record SipatCatalogResponse(
    IReadOnlyList<PlatformCourseResponse> Courses,
    IReadOnlyList<PlatformLibraryVideoResponse> Videos,
    IReadOnlyList<GameModuleResponse> Games,
    IReadOnlyList<CourseCategoryResponse>? Categories = null,
    IReadOnlyList<VideoSubjectResponse>? Subjects = null,
    IReadOnlyList<VideoSubjectsResponse>? VideoSubjects = null);

public sealed record VideoSubjectResponse(Guid Id, string Name);

public sealed record PlatformCourseResponse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    string Status,
    bool GamificationEnabled,
    IReadOnlyList<PlatformCourseVideoResponse> Videos,
    string GameType,
    IReadOnlyList<CourseModulePlacementDto> Modules,
    string? CoverUrl,
    IReadOnlyList<PlatformCourseLessonDto>? Lessons = null,
    Guid? CategoryId = null,
    Guid? TenantId = null,
    bool IsReadySipat = false);

public sealed record PlatformCourseLessonDto(Guid Id, string Title, string? Description, IReadOnlyList<Guid> VideoIds);

public sealed record SetPlatformCourseStructureRequest(IReadOnlyList<CourseLessonRequest>? Lessons);

public sealed record CourseLessonRequest(Guid? Id, string? Title, string? Description, IReadOnlyList<CourseLessonVideoRequest>? Videos);

public sealed record CourseLessonVideoRequest(Guid VideoId, string? Title);

public sealed record CourseModulePlacementDto(Guid ModuleId, int AfterVideoCount);

public sealed record VideoCheckpointDto(long TimeMilliseconds, Guid ModuleId);

public sealed record GameQuestionDto(string? Text, IReadOnlyList<string>? Options, int CorrectIndex);

public sealed record SaveGameModuleRequest(
    string? Title,
    string? GameType,
    IReadOnlyList<GameQuestionDto>? Questions,
    GameContent? Content = null);

public sealed record GameModuleResponse(
    Guid Id,
    string Title,
    string GameType,
    IReadOnlyList<GameQuestionDto> Questions,
    DateTimeOffset CreatedAt,
    int UsageCount,
    GameContent? Content = null,
    Guid? TenantId = null,
    string? CompanyName = null);

public sealed record ProgramDayDto(
    Guid? Id,
    string? Title,
    DateOnly? Date,
    string? Subject,
    IReadOnlyList<Guid>? VideoIds,
    IReadOnlyList<Guid>? GameIds,
    IReadOnlyList<ProgramGamePlaceDto>? GamePlaces = null);

/// <summary>Read only: a game of the day opens after <paramref name="AfterVideo"/> of the day's videos (0: before the first).</summary>
public sealed record ProgramGamePlaceDto(Guid GameId, int AfterVideo);

public sealed record SaveProgramRequest(string? Title, IReadOnlyList<ProgramDayDto>? Days);

public sealed record ProgramResponse(Guid Id, string Title, IReadOnlyList<ProgramDayDto> Days, DateTimeOffset CreatedAt);

public sealed record SetCourseModulesRequest(IReadOnlyList<CourseModulePlacementDto>? Items);

public sealed record SetVideoCheckpointsRequest(IReadOnlyList<VideoCheckpointDto>? Items);

public sealed record PlatformCourseVideoResponse(
    Guid Id,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt,
    string FileUrl,
    IReadOnlyList<VideoCheckpointDto> Checkpoints,
    Guid? LessonId = null,
    string? LibraryTitle = null,
    string Status = "Ready",
    string? ProcessingError = null,
    bool HasSd480 = false,
    string Provider = "Sipat",
    string? ExternalId = null,
    bool HasFhd1080 = false,
    string? ThumbnailUrl = null);

public sealed record CreateExternalVideoRequest(
    string? Provider,
    string? Url,
    string? Title,
    long? DurationMilliseconds);

public sealed record CourseCategoryResponse(Guid Id, string Name, int CourseCount);
