using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure.Learning;

namespace SipatOnline.Infrastructure.Identity;

/// <summary>A line of the HR sheet. <c>Row</c> is its number in the sheet; a blank or missing cell means "not informed".</summary>
public sealed record ImportRow(int Row, string? Name, string? Login, string? RegistrationNumber, string? Email, string? Phone, string? Unit, string? Sector, string? Password);

/// <summary><c>CreateOnly</c> is the form of one person: a line that names someone who already exists is refused instead of updating them.</summary>
public sealed record ImportRequest(bool DryRun, IReadOnlyList<ImportRow> Rows, bool CreateOnly = false);

public sealed record ImportRejection(int Row, string? Login, string Message);

/// <summary>Someone the import creates (or would create, in the preview). The front joins it with the password it sent.</summary>
public sealed record ImportCredential(int Row, string Name, string Login);

/// <summary><c>NewUnits</c>/<c>NewSectors</c>: names the sheet brings that the company did not have; the import adds them to its lists.</summary>
public sealed record ImportResult(int Created, int Updated, int Unchanged, IReadOnlyList<ImportRejection> Rejected, IReadOnlyList<ImportCredential> Credentials,
    IReadOnlyList<string>? NewUnits = null, IReadOnlyList<string>? NewSectors = null);

/// <summary>
/// The HR sheet of participants: each line updates the participant it names (by login, or registration when there is no login)
/// or creates a new one. A blank cell never erases what is there, the login of whoever exists never changes, and administrators
/// are never touched. The preview runs the same rules and saves nothing; each save call is one transaction (the front sends a big sheet in chunks of 100 lines, to fit the request timeout).
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
    private const string RegistrationOfAnotherMessage = "A matrícula pertence a outro colaborador.";
    /// <summary>U+FFFD, what a decoder leaves where a byte did not make sense (a Windows-1252 "í" read as UTF-8).</summary>
    private const char ReplacementCharacter = (char)0xFFFD;
    private const string UnreadableMessage = "A linha tem caracteres ilegíveis. Salve a planilha como .xlsx ou CSV UTF-8 e envie de novo.";
    private const string AlreadyExistsMessage = "Já existe um colaborador com esse login ou matrícula.";

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
        // where each person was before the sheet: someone it moves gets the trainings of where they go
        var placedBefore = company.People.Values.Select(person => new SipatOnline.Infrastructure.Learning.PlacementBefore(
            person.User.Id, person.User.UnitId, person.User.SectorId)).ToArray();
        var plan = await PlanAsync(rows, company, request.CreateOnly, token);
        // only what an accepted line uses: a refused line adds nothing to the lists
        var people = plan.Creates.Select(item => item.User).Concat(company.People.Values.Select(person => person.User)).ToArray();
        var usedUnits = people.Select(user => user.UnitId).OfType<Guid>().ToHashSet();
        var usedSectors = people.Select(user => user.SectorId).OfType<Guid>().ToHashSet();
        var newUnits = company.Units.Added.Where(item => usedUnits.Contains(item.Id)).ToArray();
        var newSectors = company.Sectors.Added.Where(item => usedSectors.Contains(item.Id)).ToArray();
        var result = new ImportResult(plan.Creates.Count, plan.Updated, plan.Unchanged, plan.Rejected,
            plan.Creates.Select(item => item.Credential).ToArray(),
            newUnits.Select(item => item.Name).ToArray(), newSectors.Select(item => item.Name).ToArray());
        if (request.DryRun) return Result<ImportResult>.Success(result);

        if (plan.Creates.Count > 0 && company.ParticipantRoleId is null) return Failed();
        PrepareAccounts(plan.Creates);

        await using (var transaction = await db.Database.BeginTransactionAsync(token))
        {
            try
            {
                var now = clock.GetUtcNow();
                foreach (var (id, name, reactivate) in newUnits)
                {
                    if (reactivate) await db.CompanyUnits.Where(item => item.Id == id).ExecuteUpdateAsync(set => set.SetProperty(item => item.IsActive, true), token);
                    else db.CompanyUnits.Add(new CompanyUnitEntity { Id = id, TenantId = tenant.Value, Name = name, NameKey = ProfileText.CatalogKey(name), IsActive = true, CreatedAt = now });
                }

                foreach (var (id, name, reactivate) in newSectors)
                {
                    if (reactivate) await db.CompanySectors.Where(item => item.Id == id).ExecuteUpdateAsync(set => set.SetProperty(item => item.IsActive, true), token);
                    else db.CompanySectors.Add(new CompanySectorEntity { Id = id, TenantId = tenant.Value, Name = name, NameKey = ProfileText.CatalogKey(name), IsActive = true, CreatedAt = now });
                }

                foreach (var create in plan.Creates)
                {
                    db.Users.Add(create.User);
                    db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = create.User.Id, RoleId = company.ParticipantRoleId!.Value });
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

        var nowPlaced = company.People.Values.ToDictionary(person => person.User.Id, person => (person.User.UnitId, person.User.SectorId));
        var moved = placedBefore.Where(before => nowPlaced.TryGetValue(before.ParticipantId, out var now) &&
            (now.UnitId != before.UnitId || now.SectorId != before.SectorId)).ToArray();
        db.ChangeTracker.Clear();
        // a line with a unit and a sector makes that sector one of that unit
        await CompanyRegistryService.LinkPlacedAsync(db, tenant.Value, token);
        // people who arrive while a training is live start with its days already there
        if (result.Created > 0) await distribution.EnsureAssignmentsAsync(tenant.Value, plan.Creates.Select(item => item.User.Id).ToArray(), token);
        if (moved.Length > 0) await distribution.PlacementChangedAsync(tenant.Value, moved, token);
        return Result<ImportResult>.Success(result);
    }

    /// <summary>
    /// Fills in what <c>UserManager.CreateAsync</c> would (password hash, stamps, normalized names, lockout), hashing the
    /// passwords in parallel: one by one, the hashing alone makes a sheet of hundreds of people outlast the request.
    /// The passwords were already checked by the same validators in the plan.
    /// </summary>
    private void PrepareAccounts(IReadOnlyList<Created> creates)
    {
        var hasher = users.PasswordHasher;
        var hashes = new string[creates.Count];
        Parallel.For(0, creates.Count, new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount },
            index => hashes[index] = hasher.HashPassword(creates[index].User, creates[index].Password));

        var lockoutEnabled = users.SupportsUserLockout && users.Options.Lockout.AllowedForNewUsers;
        for (var index = 0; index < creates.Count; index++)
        {
            var user = creates[index].User;
            user.PasswordHash = hashes[index];
            user.SecurityStamp = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(20));
            user.ConcurrencyStamp = Guid.NewGuid().ToString();
            user.NormalizedUserName = users.NormalizeName(user.UserName);
            user.NormalizedEmail = users.NormalizeEmail(user.Email);
            user.LockoutEnabled = lockoutEnabled;
        }
    }

    private async Task<Plan> PlanAsync(IReadOnlyList<ImportRow> rows, Company company, bool createOnly, CancellationToken token)
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
        var registrations = new Dictionary<string, RegistrationOwner>(company.Registrations, StringComparer.Ordinal);
        foreach (var row in rows)
        {
            var outcome = await EvaluateAsync(row, company, createOnly, takenLogins, firstRowOf, registrations, now, token);
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

    private async Task<Outcome> EvaluateAsync(ImportRow row, Company company, bool createOnly, HashSet<string> takenLogins,
        Dictionary<string, int> firstRowOf, Dictionary<string, RegistrationOwner> registrations, DateTimeOffset now, CancellationToken token)
    {
        // 1. standardize: a sheet read in the wrong encoding, or numbers Excel turned into 1,23E+10, would be saved wrong
        if (new[] { row.Name, row.Login, row.RegistrationNumber, row.Email, row.Phone, row.Unit, row.Sector, row.Password }
            .Any(value => value?.Contains(ReplacementCharacter) == true))
            return new Rejected(Trimmed(row.Login), UnreadableMessage);
        if (ProfileText.IsScientificNotation(row.Login)) return new Rejected(Trimmed(row.Login), ProfileText.ScientificNotationMessage);
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
        var newRegistration = registration.Value.Value;
        company.People.TryGetValue(login?.NormalizedValue ?? string.Empty, out var byLogin);
        // older logins are the registration as it was typed ("12.345-6"), before registrations were standardized
        if (byLogin is null && IsBlank(row.Login) && !IsBlank(row.RegistrationNumber)
            && LoginIdentifier.Create(row.RegistrationNumber) is { IsSuccess: true } typed)
            company.People.TryGetValue(typed.Value.NormalizedValue, out byLogin);
        Person? person = null;
        if (IsBlank(row.Login) && newRegistration is not null && registrations.TryGetValue(newRegistration, out var owner))
        {
            // only the registration came: it is whoever has it stored, or whoever has it as the login — and they must be the same
            if (owner.Person is null && owner.Row is { } ownerRow)
                return new Rejected(shownLogin, $"Matrícula repetida: a linha {ownerRow} já tem essa matrícula.");
            if (owner.Person is null || (byLogin is not null && byLogin.User.Id != owner.Person.User.Id))
                return new Rejected(shownLogin, RegistrationOfAnotherMessage);
            person = owner.Person;
        }
        else if (byLogin is not null)
        {
            if (!byLogin.IsParticipant) return new Rejected(shownLogin, "Esse login é de um administrador.");
            person = byLogin;
        }

        // the form of one person creates; it never overwrites someone who already exists
        if (createOnly && person is not null) return new Rejected(shownLogin, AlreadyExistsMessage);

        // 6. the same person twice in the sheet
        var sheetKey = person is not null ? "login:" + person.User.NormalizedEmployeeIdentifier
            : login is not null ? "login:" + login.NormalizedValue
            : name is not null ? "name:" + ProfileText.CatalogKey(name) : null;
        if (sheetKey is not null && firstRowOf.TryGetValue(sheetKey, out var firstRow))
            return new Rejected(shownLogin, person is not null
                ? $"Linha repetida: essa pessoa já está na linha {firstRow}."
                : login is not null
                    ? $"Login repetido: a linha {firstRow} já usa esse login."
                    : $"Nome repetido: a linha {firstRow} já tem esse nome. Informe o login para diferenciar.");

        // 3. unit and sector: a name the company does not have yet joins its list with the import
        Guid? unitId = null;
        if (!IsBlank(row.Unit))
        {
            unitId = company.Units.Resolve(row.Unit!);
            if (unitId is null) return new Rejected(shownLogin, $"O nome da unidade pode ter até {Catalog.MaximumNameLength} caracteres.");
        }

        Guid? sectorId = null;
        if (!IsBlank(row.Sector))
        {
            sectorId = company.Sectors.Resolve(row.Sector!);
            if (sectorId is null) return new Rejected(shownLogin, $"O nome do setor pode ter até {Catalog.MaximumNameLength} caracteres.");
        }

        // 4. update: only what the line informs; the login, the password and the active flag stay as they are
        if (person is not null)
        {
            var user = person.User;
            if (newRegistration is not null && registrations.TryGetValue(newRegistration, out var holder) && holder.Person?.User.Id != user.Id)
                return new Rejected(shownLogin, RegistrationOfAnotherMessage);

            var changed = false;
            if (name is not null && !user.DisplayNameLocked && user.DisplayName != name) { user.DisplayName = name; changed = true; }
            if (newRegistration is not null && user.RegistrationNumber != newRegistration)
            {
                // the number it leaves is free again for a later line of the sheet
                if (user.RegistrationNumber is { } previous && registrations.TryGetValue(previous, out var previousHolder) && previousHolder.Person?.User.Id == user.Id)
                    registrations.Remove(previous);
                user.RegistrationNumber = newRegistration;
                registrations[newRegistration] = new RegistrationOwner(person, row.Row);
                changed = true;
            }

            if (email.Value.Value is { } newEmail && user.Email != newEmail) { user.Email = newEmail; user.NormalizedEmail = users.NormalizeEmail(newEmail); changed = true; }
            if (phone.Value.Value is { } newPhone && user.Phone != newPhone) { user.Phone = newPhone; changed = true; }
            if (unitId is not null && user.UnitId != unitId) { user.UnitId = unitId; changed = true; }
            if (sectorId is not null && user.SectorId != sectorId) { user.SectorId = sectorId; changed = true; }
            if (changed) user.ConcurrencyStamp = Guid.NewGuid().ToString();
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
        if (newRegistration is not null && registrations.ContainsKey(newRegistration))
            return new Rejected(shownLogin, RegistrationOfAnotherMessage);
        // without a login, a name already in the company is most likely that person under an older login or registration
        if (IsBlank(row.Login) && company.ParticipantNameKeys.Contains(ProfileText.CatalogKey(name)))
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
        if (newRegistration is not null) registrations[newRegistration] = new RegistrationOwner(null, row.Row);
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
        // an admin is a participant too, but the sheet never changes it
        participantIds.ExceptWith(await AdminAccounts.AdminIdsAsync(db, tenant, token));

        // the preview reads; the save tracks the people so their changes go in the same transaction
        var accounts = db.Users.Where(user => user.TenantId == tenant);
        var people = await (readOnly ? accounts.AsNoTracking() : accounts).ToListAsync(token);
        var byLogin = people.ToDictionary(user => user.NormalizedEmployeeIdentifier,
            user => new Person(user, participantIds.Contains(user.Id)), StringComparer.Ordinal);
        var nameKeys = people.Where(user => participantIds.Contains(user.Id))
            .Select(user => ProfileText.CatalogKey(ProfileText.PersonName(user.DisplayName))).ToHashSet(StringComparer.Ordinal);

        var units = new Catalog(await db.CompanyUnits.AsNoTracking().Where(item => item.TenantId == tenant)
            .Select(item => new CatalogItem(item.Id, item.NameKey, item.IsActive)).ToListAsync(token));
        var sectors = new Catalog(await db.CompanySectors.AsNoTracking().Where(item => item.TenantId == tenant)
            .Select(item => new CatalogItem(item.Id, item.NameKey, item.IsActive)).ToListAsync(token));
        // a registration number stored on two people (data from before the import existed) belongs to no one in particular
        var registrations = byLogin.Values.Where(person => person.IsParticipant && person.User.RegistrationNumber is not null)
            .GroupBy(person => person.User.RegistrationNumber!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => new RegistrationOwner(group.Count() == 1 ? group.Single() : null, null), StringComparer.Ordinal);
        return new Company(tenant, participantRole, byLogin, nameKeys, registrations, units, sectors, await registry.GetRulesAsync(tenant, token));
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

    /// <summary>Who has a registration number: an existing participant, or (<c>Person</c> null) a new one of line <c>Row</c>; both null when two people share it.</summary>
    private sealed record RegistrationOwner(Person? Person, int? Row);

    private sealed record Company(
        Guid TenantId,
        Guid? ParticipantRoleId,
        IReadOnlyDictionary<string, Person> People,
        IReadOnlySet<string> ParticipantNameKeys,
        IReadOnlyDictionary<string, RegistrationOwner> Registrations,
        Catalog Units,
        Catalog Sectors,
        ProfileRules Rules);

    private sealed record CatalogItem(Guid Id, string NameKey, bool IsActive);

    /// <summary>The units (or sectors) of the company. A name it does not have is added; one that was deactivated comes back.</summary>
    private sealed class Catalog(IReadOnlyList<CatalogItem> items)
    {
        public const int MaximumNameLength = 100;
        private readonly Dictionary<string, CatalogItem> byKey = items.ToDictionary(item => item.NameKey, StringComparer.Ordinal);

        /// <summary>What the import adds (Reactivate: it existed, deactivated), in the order the sheet first names them.</summary>
        public List<(Guid Id, string Name, bool Reactivate)> Added { get; } = [];

        public Guid? Resolve(string raw)
        {
            var name = string.Join(' ', raw.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            if (name.Length > MaximumNameLength) return null;
            var key = ProfileText.CatalogKey(name);
            if (byKey.TryGetValue(key, out var known))
            {
                if (known.IsActive) return known.Id;
                Added.Add((known.Id, name, true));
                byKey[key] = known with { IsActive = true };
                return known.Id;
            }

            var id = Guid.NewGuid();
            Added.Add((id, name, false));
            byKey[key] = new CatalogItem(id, key, true);
            return id;
        }
    }

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
