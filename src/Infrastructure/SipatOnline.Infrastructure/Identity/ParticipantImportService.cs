using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure.Learning;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>A line of the HR sheet. <c>Row</c> is its number in the sheet; a blank or missing cell means "not informed".</summary>
public sealed record ImportRow(int Row, string? Name, string? Login, string? RegistrationNumber, string? Email, string? Phone, string? Unit, string? Sector, string? Password);

public sealed record ImportRequest(bool DryRun, IReadOnlyList<ImportRow> Rows);

public sealed record ImportRejection(int Row, string? Login, string Message);

/// <summary>Someone the import creates (or would create, in the preview). The front joins it with the password it sent.</summary>
public sealed record ImportCredential(int Row, string Name, string Login);

public sealed record ImportResult(int Created, int Updated, int Unchanged, IReadOnlyList<ImportRejection> Rejected, IReadOnlyList<ImportCredential> Credentials);

/// <summary>
/// The HR sheet of participants: each line updates the participant it names (by login, or registration when there is no login)
/// or creates a new one. A blank cell never erases what is there, the login of whoever exists never changes, and administrators
/// are never touched. The preview runs the same rules and saves nothing; the save is one transaction.
/// </summary>
public sealed class ParticipantImportService(
    PlatformDbContext db,
    UserManager<PlatformIdentityUser> users,
    CompanyRegistryService registry,
    LearningDistributionService distribution,
    ITenantContext tenantContext,
    ICurrentActor actor,
    IAuditTrail audit,
    TimeProvider clock)
{
    public const int MaximumRows = 2000;
    private const int MaximumEmailLength = 256;
    private const string LoginFallback = "participante";
    private const string InvalidEmailMessage = "O e-mail informado não é válido.";

    public async Task<Result<ImportResult>> ImportAsync(ImportRequest request, CancellationToken token)
    {
        if (!(actor.IsInRole(PlatformRoles.SuperAdmin) || actor.IsInRole(PlatformRoles.ClientAdmin) || actor.IsInRole(PlatformRoles.PlatformOperator)))
            return Failure("identity.forbidden", "Você não tem permissão para alterar usuários.");
        if (tenantContext.CurrentTenantId is not { IsEmpty: false } tenant)
            return Failure("tenant.context.required", "Não foi possível identificar a empresa.");
        var rows = request.Rows ?? [];
        if (rows.Count > MaximumRows)
            return Failure("import.too_many_rows", $"A carga aceita no máximo {MaximumRows} linhas.");

        var company = await LoadAsync(tenant.Value, request.DryRun, token);
        var plan = await PlanAsync(rows, company, token);
        var result = new ImportResult(plan.Creates.Count, plan.Updated, plan.Unchanged, plan.Rejected,
            plan.Creates.Select(item => item.Credential).ToArray());
        if (request.DryRun) return Result<ImportResult>.Success(result);

        await using (var transaction = await db.Database.BeginTransactionAsync(token))
        {
            try
            {
                foreach (var create in plan.Creates)
                {
                    var created = await users.CreateAsync(create.User, create.Password);
                    if (!created.Succeeded) return Failed();
                    var role = await users.AddToRoleAsync(create.User, PlatformRoles.Participant);
                    if (!role.Succeeded) return Failed();
                }

                await audit.WriteAsync(new AuditRecord(actor.UserId ?? "system", tenant, "identity.users.imported", "user",
                    $"created={result.Created};updated={result.Updated}", clock.GetUtcNow()), token);
                await db.SaveChangesAsync(token);
                await transaction.CommitAsync(token);
            }
            catch (DbUpdateException)
            {
                // not a problem of any line (e.g. someone saved the same login at the same time): nothing of the import stays
                return Failed();
            }
        }

        // people who arrive while a training is live start with its days already there
        if (result.Created > 0) await distribution.EnsureAssignmentsAsync(tenant.Value, null, token);
        return Result<ImportResult>.Success(result);
    }

    private async Task<Plan> PlanAsync(IReadOnlyList<ImportRow> rows, Company company, CancellationToken token)
    {
        var plan = new Plan();
        var now = clock.GetUtcNow();
        // logins the sheet names explicitly are kept out of the generated ones, so a generated login never takes a later line's
        var takenLogins = company.People.Keys.ToHashSet(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var explicitLogin = LookupText(row.Login, ProfileText.RegistrationNumber(row.RegistrationNumber) is { IsSuccess: true } registration ? registration.Value.Value : null);
            if (explicitLogin is not null && LoginIdentifier.Create(explicitLogin) is { IsSuccess: true } login)
                takenLogins.Add(login.Value.NormalizedValue);
        }

        var firstRowOf = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var outcome = await EvaluateAsync(row, company, takenLogins, firstRowOf, now, token);
            switch (outcome)
            {
                case Rejected rejected:
                    plan.Rejected.Add(new ImportRejection(row.Row, rejected.Login, rejected.Message));
                    continue;
                case Updated updated:
                    if (updated.Changed) plan.Updated++;
                    else plan.Unchanged++;
                    break;
                case Created created:
                    plan.Creates.Add(created);
                    break;
            }

            if (outcome.SheetKey is { } sheetKey) firstRowOf[sheetKey] = row.Row;
        }

        return plan;
    }

    private async Task<Outcome> EvaluateAsync(ImportRow row, Company company, HashSet<string> takenLogins,
        Dictionary<string, int> firstRowOf, DateTimeOffset now, CancellationToken token)
    {
        // 1. standardize
        var registration = ProfileText.RegistrationNumber(row.RegistrationNumber);
        if (!registration.IsSuccess) return new Rejected(Trimmed(row.Login), registration.Error.Message);
        var phone = ProfileText.Phone(row.Phone);
        if (!phone.IsSuccess) return new Rejected(Trimmed(row.Login), phone.Error.Message);
        var email = ProfileText.Email(row.Email);
        if (!email.IsSuccess) return new Rejected(Trimmed(row.Login), email.Error.Message);
        if (email.Value.Value is { Length: > MaximumEmailLength }) return new Rejected(Trimmed(row.Login), InvalidEmailMessage);
        var name = IsBlank(row.Name) ? null : ProfileText.PersonName(row.Name!);
        if (name is { Length: > DisplayName.MaximumLength })
            return new Rejected(Trimmed(row.Login), $"O nome deve ter no máximo {DisplayName.MaximumLength} caracteres.");

        // 2. who is it
        LoginIdentifier? login = null;
        if (LookupText(row.Login, registration.Value.Value) is { } lookup)
        {
            var created = LoginIdentifier.Create(lookup);
            if (!created.IsSuccess) return new Rejected(lookup.Trim(), created.Error.Message);
            if (created.Value.Value.Length > LoginIdentifier.MaximumLength) return new Rejected(lookup.Trim(), "O login é longo demais.");
            login = created.Value;
        }

        var shownLogin = login?.Value;
        Person? person = null;
        if (login is not null && company.People.TryGetValue(login.NormalizedValue, out var found))
        {
            if (!found.IsParticipant) return new Rejected(shownLogin, "Esse login é de um administrador.");
            person = found;
        }

        // 6. the same person twice in the sheet
        var sheetKey = login is not null ? "login:" + login.NormalizedValue : name is not null ? "name:" + ProfileText.CatalogKey(name) : null;
        if (sheetKey is not null && firstRowOf.TryGetValue(sheetKey, out var firstRow))
            return new Rejected(shownLogin, $"Linha repetida: a mesma pessoa já está na linha {firstRow}.");

        // 3. unit and sector, only from the active lists of this company
        Guid? unitId = null;
        if (!IsBlank(row.Unit))
        {
            if (!company.Units.TryGetValue(ProfileText.CatalogKey(row.Unit!), out var id))
                return new Rejected(shownLogin, $"Unidade \"{row.Unit!.Trim()}\" não está na lista da empresa.");
            unitId = id;
        }

        Guid? sectorId = null;
        if (!IsBlank(row.Sector))
        {
            if (!company.Sectors.TryGetValue(ProfileText.CatalogKey(row.Sector!), out var id))
                return new Rejected(shownLogin, $"Setor \"{row.Sector!.Trim()}\" não está na lista da empresa.");
            sectorId = id;
        }

        // 4. update: only what the line informs; the login, the password and the active flag stay as they are
        if (person is not null)
        {
            var user = person.User;
            var changed = false;
            if (name is not null && !user.DisplayNameLocked && user.DisplayName != name) { user.DisplayName = name; changed = true; }
            if (registration.Value.Value is { } newRegistration && user.RegistrationNumber != newRegistration) { user.RegistrationNumber = newRegistration; changed = true; }
            if (email.Value.Value is { } newEmail && user.Email != newEmail) { user.Email = newEmail; user.NormalizedEmail = users.NormalizeEmail(newEmail); changed = true; }
            if (phone.Value.Value is { } newPhone && user.Phone != newPhone) { user.Phone = newPhone; changed = true; }
            if (unitId is not null && user.UnitId != unitId) { user.UnitId = unitId; changed = true; }
            if (sectorId is not null && user.SectorId != sectorId) { user.SectorId = sectorId; changed = true; }
            return new Updated(changed) { SheetKey = sheetKey };
        }

        // 5. create
        if (name is null) return new Rejected(shownLogin, "Informe o nome.");
        var rules = company.Rules;
        if (rules.RequireRegistration && registration.Value.Value is null) return new Rejected(shownLogin, "Falta a matrícula, obrigatória nesta empresa.");
        if (rules.RequireEmail && email.Value.Value is null) return new Rejected(shownLogin, "Falta o e-mail, obrigatório nesta empresa.");
        if (rules.RequirePhone && phone.Value.Value is null) return new Rejected(shownLogin, "Falta o telefone, obrigatório nesta empresa.");
        if (rules.RequireUnit && unitId is null) return new Rejected(shownLogin, "Falta a unidade, obrigatória nesta empresa.");
        if (rules.RequireSector && sectorId is null) return new Rejected(shownLogin, "Falta o setor, obrigatório nesta empresa.");
        if (login is null && company.ParticipantNameKeys.Contains(ProfileText.CatalogKey(name)))
            return new Rejected(null, "Já existe um colaborador com esse nome. Informe o login para atualizar.");

        if (login is null)
        {
            var generated = LoginIdentifier.Create(GenerateLogin(name, takenLogins));
            if (!generated.IsSuccess) return new Rejected(null, generated.Error.Message);
            login = generated.Value;
        }

        var accountId = Guid.NewGuid();
        var account = new PlatformIdentityUser
        {
            Id = accountId,
            UserName = $"account-{accountId:N}",
            TenantId = company.TenantId,
            EmployeeIdentifier = login.Value,
            NormalizedEmployeeIdentifier = login.NormalizedValue,
            DisplayName = name,
            CreatedAt = now,
            IsActive = true,
            RegistrationNumber = registration.Value.Value,
            Email = email.Value.Value,
            Phone = phone.Value.Value,
            UnitId = unitId,
            SectorId = sectorId
        };
        if (string.IsNullOrEmpty(row.Password) || !await IsAcceptedPasswordAsync(account, row.Password))
            return new Rejected(login.Value, "A senha inicial não atende aos requisitos.");

        takenLogins.Add(login.NormalizedValue);
        return new Created(account, row.Password, new ImportCredential(row.Row, name, login.Value)) { SheetKey = sheetKey };
    }

    private static string GenerateLogin(string name, HashSet<string> takenLogins)
    {
        var candidate = ProfileText.LoginCandidate(name);
        var stem = candidate.Length == 0 ? LoginFallback : candidate;
        candidate = stem;
        for (var suffix = 2; takenLogins.Contains(Normalized(candidate)); suffix++)
            candidate = stem + suffix.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return candidate;
    }

    private static string Normalized(string login) =>
        LoginIdentifier.Create(login) is { IsSuccess: true } identifier ? identifier.Value.NormalizedValue : login.ToUpperInvariant();

    /// <summary>The same validators the account creation runs, so the preview refuses what the save would refuse.</summary>
    private async Task<bool> IsAcceptedPasswordAsync(PlatformIdentityUser account, string password)
    {
        foreach (var validator in users.PasswordValidators)
        {
            if (!(await validator.ValidateAsync(users, account, password)).Succeeded) return false;
        }

        return true;
    }

    private async Task<Company> LoadAsync(Guid tenant, bool readOnly, CancellationToken token)
    {
        var participantRole = await db.Roles.AsNoTracking()
            .Where(role => role.NormalizedName == PlatformRoles.Participant.ToUpperInvariant())
            .Select(role => (Guid?)role.Id).SingleOrDefaultAsync(token);
        var participantIds = (await db.UserRoles.AsNoTracking()
            .Where(link => link.RoleId == participantRole && db.Users.Any(user => user.Id == link.UserId && user.TenantId == tenant))
            .Select(link => link.UserId).ToListAsync(token)).ToHashSet();

        // the preview reads; the save tracks the people so their changes go in the same transaction
        var accounts = db.Users.Where(user => user.TenantId == tenant);
        var people = await (readOnly ? accounts.AsNoTracking() : accounts).ToListAsync(token);
        var byLogin = people.ToDictionary(user => user.NormalizedEmployeeIdentifier,
            user => new Person(user, participantIds.Contains(user.Id)), StringComparer.Ordinal);
        var nameKeys = people.Where(user => participantIds.Contains(user.Id))
            .Select(user => ProfileText.CatalogKey(ProfileText.PersonName(user.DisplayName))).ToHashSet(StringComparer.Ordinal);

        var units = await db.CompanyUnits.AsNoTracking().Where(item => item.TenantId == tenant && item.IsActive)
            .ToDictionaryAsync(item => item.NameKey, item => item.Id, StringComparer.Ordinal, token);
        var sectors = await db.CompanySectors.AsNoTracking().Where(item => item.TenantId == tenant && item.IsActive)
            .ToDictionaryAsync(item => item.NameKey, item => item.Id, StringComparer.Ordinal, token);
        return new Company(tenant, byLogin, nameKeys, units, sectors, await registry.GetRulesAsync(tenant, token));
    }

    private static string? LookupText(string? login, string? registration) => IsBlank(login) ? registration : login;

    private static bool IsBlank(string? value) => string.IsNullOrWhiteSpace(value);

    private static string? Trimmed(string? value) => IsBlank(value) ? null : value!.Trim();

    private Result<ImportResult> Failed()
    {
        db.ChangeTracker.Clear();
        return Failure("import.failed", "Não foi possível gravar a carga. Nada foi alterado; tente de novo.");
    }

    private static Result<ImportResult> Failure(string code, string message) =>
        Result<ImportResult>.Failure(new DomainError(code, message));

    private sealed record Person(PlatformIdentityUser User, bool IsParticipant);

    private sealed record Company(
        Guid TenantId,
        IReadOnlyDictionary<string, Person> People,
        IReadOnlySet<string> ParticipantNameKeys,
        IReadOnlyDictionary<string, Guid> Units,
        IReadOnlyDictionary<string, Guid> Sectors,
        ProfileRules Rules);

    private abstract record Outcome
    {
        /// <summary>What makes two lines of the sheet the same person: the login, or the name when there is neither login nor registration.</summary>
        public string? SheetKey { get; init; }
    }

    private sealed record Rejected(string? Login, string Message) : Outcome;

    private sealed record Updated(bool Changed) : Outcome;

    private sealed record Created(PlatformIdentityUser User, string Password, ImportCredential Credential) : Outcome;

    private sealed class Plan
    {
        public List<ImportRejection> Rejected { get; } = [];

        public List<Created> Creates { get; } = [];

        public int Updated { get; set; }

        public int Unchanged { get; set; }
    }
}
