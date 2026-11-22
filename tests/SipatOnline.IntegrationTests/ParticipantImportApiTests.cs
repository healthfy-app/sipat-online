using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using Testcontainers.PostgreSql;
using Xunit.Abstractions;

namespace SipatOnline.IntegrationTests;

public sealed class ParticipantImportApiTests(ITestOutputHelper output)
{
    private const string Password = "Senha123!";

    [DockerFact]
    public async Task DryRun_ReportsAndSavesNothing()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var before = await CountUsersAsync(factory);

        var result = await ImportOkAsync(admin, token, true,
            Row(2, "Carlos Pereira"), Row(3, "Beatriz Lima"), Row(4, "Rui Costa"));

        Assert.Equal(3, result.Created);
        Assert.Empty(result.Rejected);
        Assert.Equal(["carlos.pereira", "beatriz.lima", "rui.costa"], result.Credentials.Select(item => item.Login).ToArray());
        Assert.Equal(before, await CountUsersAsync(factory));
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.False(await db.AuditEntries.AnyAsync(entry => entry.Action == "identity.users.imported"));
    }

    [DockerFact]
    public async Task Import_CreatesWithStandardizedData()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Tecnologia da Informação")).Single();

        var result = await ImportOkAsync(admin, token, false,
            Row(2, "MARIA DAS GRAÇAS") with { RegistrationNumber = "12.345-6", Sector = "tecnologia da informacao" });

        Assert.Equal(1, result.Created);
        Assert.Equal(new ImportCredential(2, "Maria das Graças", "123456"), Assert.Single(result.Credentials));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var user = await db.Users.SingleAsync(account => account.EmployeeIdentifier == "123456");
            Assert.Equal("Maria das Graças", user.DisplayName);
            Assert.Equal("123456", user.RegistrationNumber);
            Assert.Equal(sector.Id, user.SectorId);
            Assert.True(user.IsActive);
            var audit = await db.AuditEntries.SingleAsync(entry => entry.Action == "identity.users.imported");
            Assert.Equal("created=1;updated=0", audit.SubjectId);
        }

        using var participant = CreateClient(factory);
        await SignInAsync(participant, "123456", Password);
    }

    [DockerFact]
    public async Task Import_GeneratesLoginsWithoutCollision()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "maria.silva", "Maria Aparecida Silva");

        var result = await ImportOkAsync(admin, token, false, Row(2, "Maria Silva"), Row(3, "Maria Souza Silva"));

        Assert.Equal(2, result.Created);
        Assert.Equal(["maria.silva2", "maria.silva3"], result.Credentials.Select(item => item.Login).ToArray());
        using var participant = CreateClient(factory);
        await SignInAsync(participant, "maria.silva3", Password);
    }

    [DockerFact]
    public async Task Import_UnknownSector_RejectsLineOnly()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await AddSectorsAsync(admin, token, "Produção");

        var result = await ImportOkAsync(admin, token, false,
            Row(2, "Carlos Pereira") with { Sector = "producao" },
            Row(3, "Beatriz Lima") with { Sector = "Marketing" });

        Assert.Equal(1, result.Created);
        var rejection = Assert.Single(result.Rejected);
        Assert.Equal(3, rejection.Row);
        Assert.Equal("Setor \"Marketing\" não está na lista da empresa.", rejection.Message);
    }

    [DockerFact]
    public async Task Import_RequiredFieldMissing_RejectsNewOnly()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "Joao-Existente", "Joao Existente");
        using (var rules = await SendJsonAsync(admin, HttpMethod.Put, "/api/admin/registry/rules", new ProfileRules(false, false, false, false, true), token))
            Assert.Equal(HttpStatusCode.OK, rules.StatusCode);

        var result = await ImportOkAsync(admin, token, false,
            Row(2, "Ana Nova"),
            new ImportRow(3, null, "Joao-Existente", null, "Joao@Empresa.com.br", null, null, null, null));

        Assert.Equal(0, result.Created);
        Assert.Equal(1, result.Updated);
        var rejection = Assert.Single(result.Rejected);
        Assert.Equal(2, rejection.Row);
        Assert.Equal("Falta o setor, obrigatório nesta empresa.", rejection.Message);
        var user = await FindUserAsync(factory, "Joao-Existente");
        Assert.Equal("joao@empresa.com.br", user.Email);
        Assert.Equal("JOAO@EMPRESA.COM.BR", user.NormalizedEmail);
        Assert.Null(user.SectorId);
    }

    [DockerFact]
    public async Task Import_EmptyCellKeepsExistingData()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "Joao-Existente", "Joao Existente");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var account = await db.Users.SingleAsync(item => item.EmployeeIdentifier == "Joao-Existente");
            account.Phone = "11987654321";
            await db.SaveChangesAsync();
        }

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, null, "Joao-Existente", null, null, "", null, "Produção", null));

        Assert.Equal(1, result.Updated);
        var user = await FindUserAsync(factory, "Joao-Existente");
        Assert.Equal("11987654321", user.Phone);
        Assert.Equal(sector.Id, user.SectorId);
    }

    [DockerFact]
    public async Task Import_PartialSheetUpdatesSectorOnly()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "Joao-Existente", "Joao Existente");
        var row = new ImportRow(2, null, "joao-existente", null, null, null, null, "Produção", null);

        var result = await ImportOkAsync(admin, token, false, row);

        Assert.Equal((0, 1, 0), (result.Created, result.Updated, result.Unchanged));
        Assert.Empty(result.Rejected);
        Assert.Empty(result.Credentials);
        var user = await FindUserAsync(factory, "Joao-Existente");
        Assert.Equal("Joao Existente", user.DisplayName);
        Assert.Equal(sector.Id, user.SectorId);
        Assert.True(user.IsActive);

        var again = await ImportOkAsync(admin, token, false, row);
        Assert.Equal(0, again.Updated);
        Assert.Equal(1, again.Unchanged);
        using var participant = CreateClient(factory);
        await SignInAsync(participant, "Joao-Existente", "ParticipantPass123");
    }

    [DockerFact]
    public async Task Import_SameSheetTwice_NoDuplicates()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        ImportRow[] sheet = [Row(2, "Carlos Pereira"), Row(3, "beatriz  lima")];

        var first = await ImportOkAsync(admin, token, false, sheet);
        Assert.Equal(2, first.Created);
        var before = await CountUsersAsync(factory);

        var second = await ImportOkAsync(admin, token, false, sheet);

        Assert.Equal(0, second.Created);
        Assert.Equal(2, second.Rejected.Count);
        Assert.All(second.Rejected, rejection =>
            Assert.Equal("Já existe um colaborador com esse nome. Informe o login para atualizar.", rejection.Message));
        Assert.Equal(before, await CountUsersAsync(factory));
    }

    [DockerFact]
    public async Task Import_RepeatedLineInSameSheet_RejectsSecond()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);

        var result = await ImportOkAsync(admin, token, false,
            Row(2, "Ana Xavier") with { Login = "ana.x" },
            Row(3, "Ana Xavier") with { Login = "ANA.X" },
            Row(4, "Pedro Alves"),
            Row(5, "PEDRO ALVES"),
            Row(6, "Maria Lima") with { Login = "maria.lima" },
            Row(7, "Maria Lima Duarte") with { RegistrationNumber = "77" },
            Row(8, "Outra Pessoa") with { RegistrationNumber = "7.7" });

        Assert.Equal(4, result.Created);
        Assert.Equal(
            [
                new ImportRejection(3, "ANA.X", "Linha repetida: a mesma pessoa já está na linha 2."),
                new ImportRejection(5, null, "Linha repetida: a mesma pessoa já está na linha 4."),
                new ImportRejection(8, "77", "Linha repetida: a mesma pessoa já está na linha 7.")
            ],
            result.Rejected.ToArray());
        Assert.Equal(["ana.x", "pedro.alves", "maria.lima", "77"], result.Credentials.Select(item => item.Login).ToArray());
    }

    [DockerFact]
    public async Task Import_NewPersonGetsPublishedTrainingDays()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres, developmentSampleEnabled: true);
        var (admin, token) = await SignInAdminAsync(factory);

        var result = await ImportOkAsync(admin, token, false, Row(2, "Rita Gomes"));

        Assert.Equal(1, result.Created);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var rita = await db.Users.SingleAsync(user => user.EmployeeIdentifier == "rita.gomes");
        var demo = await db.Users.SingleAsync(user => user.EmployeeIdentifier == "participant-demo");
        var expected = await db.LearningAssignments.Where(item => item.ParticipantId == demo.Id && item.RevokedAt == null)
            .Select(item => item.TrackId).OrderBy(id => id).ToListAsync();
        var actual = await db.LearningAssignments.Where(item => item.ParticipantId == rita.Id && item.RevokedAt == null)
            .Select(item => item.TrackId).OrderBy(id => id).ToListAsync();
        Assert.NotEmpty(expected);
        Assert.Equal(expected, actual);
    }

    [DockerFact]
    public async Task Import_DoesNotTouchAdministrators()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, "Nome Trocado", "admin-root", null, "outro@empresa.com", null, null, null, Password));

        Assert.Equal(0, result.Created + result.Updated + result.Unchanged);
        Assert.Equal(new ImportRejection(2, "admin-root", "Esse login é de um administrador."), Assert.Single(result.Rejected));
        var user = await FindUserAsync(factory, "admin-root");
        Assert.Equal("Integration Administrator", user.DisplayName);
        Assert.Null(user.Email);
    }

    [DockerFact]
    public async Task Import_MoreThan2000Rows_IsRefused()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var rows = Enumerable.Range(2, 2001).Select(index => Row(index, $"Pessoa {index}")).ToArray();

        using var response = await SendJsonAsync(admin, HttpMethod.Post, "/api/admin/users/import", new ImportRequest(true, rows), token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("import.too_many_rows", await response.Content.ReadAsStringAsync());
    }

    [DockerFact]
    public async Task Import_RegistrationOnly_FindsPersonWithOtherLogin()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "Joao-Existente", "Joao Existente");
        await SetRegistrationAsync(factory, "Joao-Existente", "4455");
        var before = await CountUsersAsync(factory);

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, null, null, "44.55", null, null, null, "Produção", null),
            new ImportRow(3, null, "joao-existente", null, null, "(11) 98765-4321", null, null, null));

        Assert.Equal((0, 1, 0), (result.Created, result.Updated, result.Unchanged));
        Assert.Equal(new ImportRejection(3, "joao-existente", "Linha repetida: a mesma pessoa já está na linha 2."), Assert.Single(result.Rejected));
        Assert.Equal(before, await CountUsersAsync(factory));
        var user = await FindUserAsync(factory, "Joao-Existente");
        Assert.Equal(sector.Id, user.SectorId);
        Assert.Equal("4455", user.RegistrationNumber);
    }

    [DockerFact]
    public async Task Import_RegistrationOfAnotherPerson_IsRejected()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "Joao-Existente", "Joao Existente");
        await SetRegistrationAsync(factory, "Joao-Existente", "9999");
        await ProvisionAsync(admin, token, "9999", "Pedro Login Numerico");
        var before = await CountUsersAsync(factory);
        const string message = "A matrícula pertence a outro colaborador.";

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, "Quem Sera", null, "9999", null, null, null, null, null),
            Row(3, "Nova Pessoa") with { Login = "nova.pessoa", RegistrationNumber = "99-99" },
            Row(4, "Outra Nova") with { Login = "outra.nova", RegistrationNumber = "123" },
            Row(5, "Mais Uma") with { Login = "mais.uma", RegistrationNumber = "1.2.3" },
            new ImportRow(6, null, "9999", "123", null, null, null, null, null));

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.Updated);
        Assert.Equal(
            [
                new ImportRejection(2, "9999", message),
                new ImportRejection(3, "nova.pessoa", message),
                new ImportRejection(5, "mais.uma", message),
                new ImportRejection(6, "9999", message)
            ],
            result.Rejected.ToArray());
        Assert.Equal(before + 1, await CountUsersAsync(factory));
        Assert.Equal("9999", (await FindUserAsync(factory, "Joao-Existente")).RegistrationNumber);
        Assert.Null((await FindUserAsync(factory, "9999")).RegistrationNumber);
    }

    [DockerFact]
    public async Task Import_600NewPeople_FinishesWellUnderTheTimeout()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var rows = Enumerable.Range(2, 600).Select(index => Row(index, $"Pessoa {index}") with { RegistrationNumber = $"M{index}" }).ToArray();

        // the preview reads the whole sheet; the save goes in chunks of 100, as the front sends it
        var preview = System.Diagnostics.Stopwatch.StartNew();
        Assert.Equal(600, (await ImportOkAsync(admin, token, true, rows)).Created);
        preview.Stop();
        output.WriteLine($"processors={Environment.ProcessorCount}; preview of 600 in {preview.Elapsed.TotalSeconds:F1} s");

        var created = 0;
        var slowest = TimeSpan.Zero;
        var watch = System.Diagnostics.Stopwatch.StartNew();
        foreach (var chunk in rows.Chunk(100))
        {
            var chunkWatch = System.Diagnostics.Stopwatch.StartNew();
            var result = await ImportOkAsync(admin, token, false, chunk);
            chunkWatch.Stop();
            output.WriteLine($"chunk of {chunk.Length} saved in {chunkWatch.Elapsed.TotalSeconds:F1} s");
            Assert.Empty(result.Rejected);
            created += result.Created;
            if (chunkWatch.Elapsed > slowest) slowest = chunkWatch.Elapsed;
        }
        watch.Stop();

        output.WriteLine($"600 new people saved in {watch.Elapsed.TotalSeconds:F1} s; slowest chunk {slowest.TotalSeconds:F1} s");
        Assert.Equal(600, created);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30), $"took {watch.Elapsed.TotalSeconds:F1} s");
        using var participant = CreateClient(factory);
        await SignInAsync(participant, "M601", Password);
    }

    [DockerFact]
    public async Task Import_UpdatesUnlockedNameButKeepsLockedName()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "livre", "Nome Antigo");
        await ProvisionAsync(admin, token, "travado", "Outro Antigo");
        var locked = await FindUserAsync(factory, "travado");
        using (var rename = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{locked.Id:D}/display-name", new ChangeDisplayNameRequest("Corrigido À Mão"), token))
            Assert.Equal(HttpStatusCode.OK, rename.StatusCode);

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, "NOVO NOME DA SILVA", "livre", null, null, null, null, null, null),
            new ImportRow(3, "NOME NOVO TRAVADO", "travado", null, null, null, null, null, null));

        Assert.Equal(1, result.Updated);
        Assert.Equal(1, result.Unchanged);
        Assert.Equal("Novo Nome da Silva", (await FindUserAsync(factory, "livre")).DisplayName);
        Assert.Equal("Corrigido À Mão", (await FindUserAsync(factory, "travado")).DisplayName);
    }

    [DockerFact]
    public async Task DryRun_UpdateChangesNothing()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await AddSectorsAsync(admin, token, "Produção");
        await ProvisionAsync(admin, token, "joao", "Joao Existente");
        var before = await FindUserAsync(factory, "joao");

        var result = await ImportOkAsync(admin, token, true,
            new ImportRow(2, "JOAO NOVO", "joao", "77", "j@x.com", "11987654321", null, "Produção", null));

        Assert.Equal(1, result.Updated);
        var after = await FindUserAsync(factory, "joao");
        Assert.Equal(before.DisplayName, after.DisplayName);
        Assert.Null(after.RegistrationNumber);
        Assert.Null(after.Email);
        Assert.Null(after.Phone);
        Assert.Null(after.SectorId);
        Assert.Equal(before.ConcurrencyStamp, after.ConcurrencyStamp);
    }

    [DockerFact]
    public async Task Import_UpdateRotatesStampAndFreesReplacedRegistration()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "joao", "Joao Existente");
        await SetRegistrationAsync(factory, "joao", "R0");
        var before = await FindUserAsync(factory, "joao");

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, null, "joao", "R1", null, null, null, null, null),
            Row(3, "Maria Nova") with { RegistrationNumber = "R0" });

        Assert.Equal((1, 1), (result.Updated, result.Created));
        Assert.Empty(result.Rejected);
        var after = await FindUserAsync(factory, "joao");
        Assert.Equal("R1", after.RegistrationNumber);
        Assert.NotEqual(before.ConcurrencyStamp, after.ConcurrencyStamp);
    }

    [DockerFact]
    public async Task Import_UnreadableCharacters_RejectsTheLine()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await AddSectorsAsync(admin, token, "Produção");
        const char Unreadable = (char)0xFFFD;
        const string message = "A linha tem caracteres ilegíveis. Salve a planilha como .xlsx ou CSV UTF-8 e envie de novo.";

        var result = await ImportOkAsync(admin, token, false,
            Row(2, $"Jo{Unreadable}o Silva"),
            Row(3, "Ana Boa") with { Sector = $"Produ{Unreadable}{Unreadable}o" },
            Row(4, "Carla Reis") with { Sector = "Produção" });

        Assert.Equal(1, result.Created);
        Assert.Equal([new ImportRejection(2, null, message), new ImportRejection(3, null, message)], result.Rejected.ToArray());
        Assert.Equal("carla.reis", Assert.Single(result.Credentials).Login);
    }

    [DockerFact]
    public async Task Import_LegacyLoginTypedAsTheRegistration_UpdatesThatPerson()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "12.345-6", "Joao Legado");
        await ProvisionAsync(admin, token, "maria.antiga", "Maria Antiga");
        var before = await CountUsersAsync(factory);

        var result = await ImportOkAsync(admin, token, false,
            new ImportRow(2, "JOAO LEGADO", null, "12.345-6", "joao@empresa.com", null, null, null, Password),
            Row(3, "MARIA ANTIGA") with { RegistrationNumber = "999" });

        Assert.Equal((0, 1), (result.Created, result.Updated));
        Assert.Equal(new ImportRejection(3, null, "Já existe um colaborador com esse nome. Informe o login para atualizar."), Assert.Single(result.Rejected));
        Assert.Equal(before, await CountUsersAsync(factory));
        var joao = await FindUserAsync(factory, "12.345-6");
        Assert.Equal("joao@empresa.com", joao.Email);
        Assert.Equal("123456", joao.RegistrationNumber);
    }

    [DockerFact]
    public async Task Import_CreateOnly_RefusesSomeoneWhoExists()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "joao", "Joao Existente");
        await ProvisionAsync(admin, token, "pedro", "Pedro Existente");
        await SetRegistrationAsync(factory, "pedro", "55");
        var before = await CountUsersAsync(factory);
        const string message = "Já existe um colaborador com esse login ou matrícula.";

        var byLogin = await ImportOkAsync(admin, token, new ImportRequest(false,
            [new ImportRow(1, "Outro Nome", "joao", null, "outro@empresa.com", null, null, null, Password)], CreateOnly: true));
        var byRegistration = await ImportOkAsync(admin, token, new ImportRequest(false,
            [new ImportRow(1, "Mais Outro", null, "5.5", "mais@empresa.com", null, null, null, Password)], CreateOnly: true));
        var someoneNew = await ImportOkAsync(admin, token, new ImportRequest(false, [Row(1, "Gente Nova")], CreateOnly: true));

        Assert.Equal(new ImportRejection(1, "joao", message), Assert.Single(byLogin.Rejected));
        Assert.Equal(message, Assert.Single(byRegistration.Rejected).Message);
        Assert.Equal((0, 0, 0), (byLogin.Created + byRegistration.Created, byLogin.Updated + byRegistration.Updated, byLogin.Unchanged + byRegistration.Unchanged));
        Assert.Equal("gente.nova", Assert.Single(someoneNew.Credentials).Login);
        Assert.Equal(before + 1, await CountUsersAsync(factory));
        var joao = await FindUserAsync(factory, "joao");
        Assert.Equal("Joao Existente", joao.DisplayName);
        Assert.Null(joao.Email);
        Assert.Null((await FindUserAsync(factory, "pedro")).Email);
    }

    [DockerFact]
    public async Task Import_ScientificNotation_RejectsTheLine()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        const string message = "A matrícula veio em notação científica (ex.: 1,23E+10). No Excel, formate a coluna como Texto e exporte de novo.";

        var result = await ImportOkAsync(admin, token, false,
            Row(2, "Ana Lima") with { RegistrationNumber = "1,23E+10" },
            Row(3, "Bia Lima") with { Login = "4.5E+11" },
            Row(4, "Cris Lima") with { RegistrationNumber = "12345678901" });

        Assert.Equal(1, result.Created);
        Assert.Equal([new ImportRejection(2, null, message), new ImportRejection(3, "4.5E+11", message)], result.Rejected.ToArray());
    }

    [DockerFact]
    public async Task Import_NewPeopleOfAChunk_GetTheDaysAndNobodyElseIsTouched()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres, developmentSampleEnabled: true);
        var (admin, token) = await SignInAdminAsync(factory);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            // someone who had a day taken away on purpose must not get it back because others were imported
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var demo = await db.Users.SingleAsync(user => user.EmployeeIdentifier == "participant-demo");
            var assignment = await db.LearningAssignments.FirstAsync(item => item.ParticipantId == demo.Id);
            db.LearningAssignments.Remove(assignment);
            await db.SaveChangesAsync();
        }

        var result = await ImportOkAsync(admin, token, false, Row(2, "Rita Gomes"), Row(3, "Davi Gomes"));

        Assert.Equal(2, result.Created);
        await using var check = factory.Services.CreateAsyncScope();
        var context = check.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var demoId = (await context.Users.SingleAsync(user => user.EmployeeIdentifier == "participant-demo")).Id;
        var ritaId = (await context.Users.SingleAsync(user => user.EmployeeIdentifier == "rita.gomes")).Id;
        var davi = (await context.Users.SingleAsync(user => user.EmployeeIdentifier == "davi.gomes")).Id;
        var demoCount = await context.LearningAssignments.CountAsync(item => item.ParticipantId == demoId);
        var ritaCount = await context.LearningAssignments.CountAsync(item => item.ParticipantId == ritaId);
        Assert.True(ritaCount > 0);
        Assert.Equal(ritaCount, await context.LearningAssignments.CountAsync(item => item.ParticipantId == davi));
        Assert.Equal(ritaCount - 1, demoCount);
    }

    private static ImportRow Row(int row, string name) => new(row, name, null, null, null, null, null, null, Password);

    private static Task<ImportResult> ImportOkAsync(HttpClient client, string token, bool dryRun, params ImportRow[] rows) =>
        ImportOkAsync(client, token, new ImportRequest(dryRun, rows));

    private static async Task<ImportResult> ImportOkAsync(HttpClient client, string token, ImportRequest request)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/users/import", request, token);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var result = await response.Content.ReadFromJsonAsync<ImportResult>();
        Assert.NotNull(result);
        return result;
    }

    private static async Task<IReadOnlyList<RegistryItem>> AddSectorsAsync(HttpClient client, string token, params string[] names)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/registry/sectors", new AddRegistryItemsRequest(names), token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var registry = await response.Content.ReadFromJsonAsync<CompanyRegistry>();
        Assert.NotNull(registry);
        return registry.Sectors;
    }

    private static async Task ProvisionAsync(HttpClient client, string token, string login, string name)
    {
        using var created = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/users",
            new ProvisionUserRequest(login, name, "ParticipantPass123", PlatformRoles.Participant), token);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
    }

    private static async Task<PlatformIdentityUser> FindUserAsync(SipatOnlineApiFactory factory, string login)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        return await db.Users.AsNoTracking().SingleAsync(user => user.EmployeeIdentifier == login);
    }

    private static async Task SetRegistrationAsync(SipatOnlineApiFactory factory, string login, string registration)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var account = await db.Users.SingleAsync(item => item.EmployeeIdentifier == login);
        account.RegistrationNumber = registration;
        await db.SaveChangesAsync();
    }

    private static async Task<int> CountUsersAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Users.CountAsync();
    }

    private static async Task<PostgreSqlContainer> StartPostgresAsync()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private static async Task<SipatOnlineApiFactory> CreateFactoryAsync(PostgreSqlContainer postgres, bool developmentSampleEnabled = false)
    {
        var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), developmentSampleEnabled);
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        return factory;
    }

    private static async Task<(HttpClient Client, string Token)> SignInAdminAsync(SipatOnlineApiFactory factory)
    {
        var client = CreateClient(factory);
        await SignInAsync(client, "admin-root", "AdminPassword123");
        return (client, await GetAntiforgeryTokenAsync(client));
    }

    private static HttpClient CreateClient(SipatOnlineApiFactory factory) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });

    private static async Task SignInAsync(HttpClient client, string loginIdentifier, string password)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/identity/login", new LoginRequest(loginIdentifier, password), token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static async Task<string> GetAntiforgeryTokenAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/identity/antiforgery");
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token?.RequestToken);
        return token.RequestToken;
    }

    private static async Task<HttpResponseMessage> SendJsonAsync<TRequest>(HttpClient client, HttpMethod method, string path, TRequest body, string token)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
}
