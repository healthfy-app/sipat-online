using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application;

namespace SipatOnline.Application.UnitTests.Learning;

public sealed class LessonMediaAccessServiceTests
{
    private static readonly Guid Tenant = Guid.NewGuid();
    private static readonly Guid Participant = Guid.NewGuid();
    private static readonly Guid Lesson = Guid.NewGuid();

    [Fact]
    public async Task Refuses_without_a_company_or_participant()
    {
        var store = new FakeStore(null);

        var noCompany = await Service(null, Participant.ToString(), store).AuthorizeAsync(Lesson, CancellationToken.None);
        var noParticipant = await Service(Tenant, null, store).AuthorizeAsync(Lesson, CancellationToken.None);
        var badParticipant = await Service(Tenant, "not-a-guid", store).AuthorizeAsync(Lesson, CancellationToken.None);

        Assert.Equal("learning.forbidden", noCompany.Error.Code);
        Assert.Equal("learning.forbidden", noParticipant.Error.Code);
        Assert.Equal("learning.forbidden", badParticipant.Error.Code);
        Assert.False(store.Called);
    }

    [Fact]
    public async Task Refuses_a_lesson_that_is_not_assigned()
    {
        var result = await Service(Tenant, Participant.ToString(), new FakeStore(null))
            .AuthorizeAsync(Lesson, CancellationToken.None);

        Assert.Equal("learning.lesson_not_found", result.Error.Code);
    }

    [Fact]
    public async Task Returns_the_media_of_an_assigned_lesson()
    {
        var media = new LessonMedia(Guid.NewGuid(), "video/mp4", true);
        var store = new FakeStore(media);

        var result = await Service(Tenant, Participant.ToString(), store).AuthorizeAsync(Lesson, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(media, result.Value);
        Assert.Equal((Tenant, Participant, Lesson), store.Asked);
    }

    private static LessonMediaAccessService Service(Guid? tenant, string? userId, ILessonMediaStore store) =>
        new(new FakeTenant(tenant), new FakeActor(userId), store);

    private sealed class FakeTenant(Guid? id) : ITenantContext
    {
        public TenantId? CurrentTenantId => id is null ? null : new TenantId(id.Value);
    }

    private sealed class FakeActor(string? userId) : ICurrentActor
    {
        public string? UserId => userId;

        public bool IsInRole(string role) => false;
    }

    private sealed class FakeStore(LessonMedia? media) : ILessonMediaStore
    {
        public bool Called { get; private set; }

        public (Guid, Guid, Guid)? Asked { get; private set; }

        public Task<LessonMedia?> FindAssignedCatalogMediaAsync(
            Guid tenantId, Guid participantId, Guid lessonId, CancellationToken cancellationToken)
        {
            Called = true;
            Asked = (tenantId, participantId, lessonId);
            return Task.FromResult(media);
        }
    }
}
