# Cadastro do participante — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O participante passa a ter matrícula, e-mail, telefone, unidade e setor (todos opcionais), a empresa cadastra as listas de unidades e setores e escolhe o que é obrigatório, e a carga do RH (CSV ou Excel) padroniza os dados, mostra uma prévia e grava tudo de uma vez no back.

**Architecture:** Os campos novos ficam em `PlatformIdentityUser`, e as listas e regras ficam em três tabelas novas do schema `identity`. Tudo é tratado por serviços da Infrastructure, no mesmo padrão do `EmployeeCredentialService`: o domínio `User` e o `UserApplicationService` não mudam. A padronização é feita por funções puras em `SipatOnline.Identity.Domain/Users/ProfileText.cs`, usadas pela carga e pelo cadastro individual. O front lê o CSV ou o .xlsx (ExcelJS, que já é dependência), transforma em linhas JSON e chama um único `POST /api/admin/users/import`, primeiro com `dryRun: true` (prévia) e depois com `dryRun: false` (grava). O "Um colaborador" também passa por esse endpoint, com uma linha só.

**Tech Stack:** .NET 10 (EF Core + Npgsql, xUnit, Testcontainers Postgres em `[DockerFact]`), React 19 + TypeScript + Vite, Vitest + Testing Library, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-11-21-cadastro-participante-design.md`

## Global Constraints

- Obrigatórios sempre: **nome** e **senha** (e o login, que o sistema gera se faltar). Opcionais: **matrícula, e-mail, telefone, unidade, setor**. A empresa pode tornar cada opcional obrigatório; tudo começa `false`.
- **O login de quem já existe não muda.** O `EmployeeIdentifier` continua sendo o login. Numa pessoa nova, o login é o informado; se não vier, é a matrícula; se não houver matrícula, um login gerado (`maria.silva`, `maria.silva2`…).
- E-mail **não** é login.
- Nome: aparar espaços, juntar espaços repetidos, primeira letra maiúscula em cada palavra e o resto minúsculo; `da, de, do, das, dos, e` ficam minúsculas quando não são a primeira palavra. `"MARIA DAS GRAÇAS DE SOUZA"` → `"Maria das Graças de Souza"`. Palavras com hífen ou apóstrofo capitalizam cada parte (`"ANA-LUÍSA D'ÁVILA"` → `"Ana-Luísa D'Ávila"`).
- Matrícula: só letras e dígitos, em maiúsculas. `"12.345-6"` → `"123456"`. Telefone: só dígitos (10 ou 11 com DDD; aceita 55 na frente e tira). E-mail: aparado, em minúsculas, com um `@` e um ponto no domínio.
- Unidade e setor: comparados **sem acento e sem diferença de maiúsculas**, com os espaços normalizados. O nome é único por empresa nessa comparação. Unidade ou setor fora da lista (ou desativado) faz a carga **recusar a linha**: a carga nunca cria item.
- Desativar unidade ou setor só tira das listas de escolha; quem já está nela continua. **Não existe apagar.**
- Carga: **célula vazia não apaga dado existente**; coluna ausente = campo não informado. A prévia (`dryRun`) **não grava nada**. A gravação é uma transação só. No máximo **2000 linhas** por carga.
- Os obrigatórios são verificados **só ao criar** uma pessoa (carga ou cadastro individual). Ligar um obrigatório não bloqueia quem já existe nem impede a atualização parcial (login + setor).
- **O nome de quem já existe não é reescrito** pela migração. A carga atualiza o nome de quem já existe, exceto quando o administrador o corrigiu à mão (`DisplayNameLocked`). A correção manual grava o texto como foi digitado, sem padronizar.
- Termos na interface: "Treinamento", "Login", "Matrícula", "Unidade", "Setor", "Participantes". Nunca "trilha" nem "Formação".
- Migração nova: **`20261126100000_AddParticipantProfile`** (a mais nova hoje é `20261125120000_AddVideoConversionLease`). Gerar com `dotnet ef migrations add AddParticipantProfile --project src/Infrastructure/SipatOnline.Infrastructure --startup-project src/Api/SipatOnline.Api` e renomear o arquivo, o `.Designer.cs` e o atributo `[Migration("…")]`.
- Só **colaboradores** (perfil `Participant`) passam pela carga e pela edição de cadastro. Administradores nunca.
- A SIPAT do cliente de 600 pessoas começa em 2026-12-01: o login e a entrega dos dias de quem já existe não podem mudar.

## Review Focus

1. **A mesma planilha carregada duas vezes, sem coluna de login nem de matrícula.** Na segunda vez não pode criar 600 pessoas em dobro. Quem tem o mesmo nome padronizado de um colaborador que já existe é recusado com "Já existe um colaborador com esse nome. Informe o login para atualizar." Teste na Task 4.
2. **Duas linhas da mesma carga com o mesmo login, ou dois "Maria Silva" sem login.** As linhas repetidas são recusadas, e os logins gerados não colidem entre si nem com os do banco (`maria.silva`, `maria.silva2`). Teste na Task 4.
3. **Planilha do Excel com acentos e cabeçalho com outro nome** ("Nome completo", "Matrícula", "E-mail", "Celular", "Departamento"). As colunas são reconhecidas pelos sinônimos, sem acento e sem diferença de maiúsculas. Uma matrícula numérica do Excel (`123456` como número, ou `1.23456E5`) vira texto `"123456"`. Teste na Task 8.
4. **Pessoa nova chega por carga enquanto um treinamento está publicado.** Ela recebe os dias, como já acontece no cadastro individual (`EnsureAssignmentsAsync`). Teste na Task 4.
5. **O administrador corrigiu à mão "Maria D'Avila", e o RH carrega "MARIA D AVILA".** A correção manual fica. Teste na Task 5.

---

### Task 1: Padronização (funções puras)

**Files:**
- Create: `src/Modules/Identity/Domain/SipatOnline.Identity.Domain/Users/ProfileText.cs`
- Test: `tests/SipatOnline.Domain.UnitTests/Users/ProfileTextTests.cs`

**Interfaces:**
- Produces (todos `public static` em `ProfileText`):
  - `string PersonName(string value)`: nome padronizado (a entrada já não está vazia).
  - `Result<string?> RegistrationNumber(string? value)`: `null` se vazio; erro `profile.registration.invalid` se, depois de limpar, ficar vazio ou passar de 64.
  - `Result<string?> Phone(string? value)`: `null` se vazio; erro `profile.phone.invalid` se não tiver 10 ou 11 dígitos depois de tirar o `55` inicial de 12 ou 13 dígitos.
  - `Result<string?> Email(string? value)`: `null` se vazio; erro `profile.email.invalid`.
  - `string CatalogKey(string value)`: sem acento (`NormalizationForm.FormD`, removendo `UnicodeCategory.NonSpacingMark`), `ToUpperInvariant`, espaços normalizados. É a chave usada para unidade, setor e nome repetido.
  - `string LoginCandidate(string personName)`: `"maria.silva"`, a partir do primeiro e do último nome padronizados, sem acento, minúsculo, só `[a-z0-9]`, unidos por `.`.

- [ ] **Step 1: Escrever os testes**

```csharp
[Theory]
[InlineData("MARIA DAS GRAÇAS DE SOUZA", "Maria das Graças de Souza")]
[InlineData("  joão   da  silva ", "João da Silva")]
[InlineData("DA SILVA", "Da Silva")]
[InlineData("ANA-LUÍSA D'ÁVILA", "Ana-Luísa D'Ávila")]
[InlineData("josé e maria", "José e Maria")]
public void PersonName_Standardizes(string input, string expected) => Assert.Equal(expected, ProfileText.PersonName(input));

[Theory]
[InlineData("12.345-6", "123456")]
[InlineData(" ab 12 ", "AB12")]
[InlineData("", null)]
[InlineData(null, null)]
public void RegistrationNumber_KeepsLettersAndDigits(string? input, string? expected) => Assert.Equal(expected, ProfileText.RegistrationNumber(input).Value);

[Fact]
public void RegistrationNumber_OnlySymbols_Fails() => Assert.Equal("profile.registration.invalid", ProfileText.RegistrationNumber(".-").Error.Code);

[Theory]
[InlineData("(27) 99999-1234", "27999991234")]
[InlineData("+55 27 3333-1234", "2733331234")]
public void Phone_KeepsDigits(string input, string expected) => Assert.Equal(expected, ProfileText.Phone(input).Value);

[Fact]
public void Phone_TooShort_Fails() => Assert.Equal("profile.phone.invalid", ProfileText.Phone("9999-1234").Error.Code);

[Theory]
[InlineData(" Maria@Empresa.COM ", "maria@empresa.com")]
public void Email_Lowercases(string input, string expected) => Assert.Equal(expected, ProfileText.Email(input).Value);

[Theory]
[InlineData("maria")]
[InlineData("maria@empresa")]
[InlineData("a b@empresa.com")]
public void Email_Invalid_Fails(string input) => Assert.Equal("profile.email.invalid", ProfileText.Email(input).Error.Code);

[Fact]
public void CatalogKey_IgnoresAccentsCaseAndSpaces() =>
    Assert.Equal(ProfileText.CatalogKey("Tecnologia da Informação"), ProfileText.CatalogKey("  tecnologia  da informacao "));

[Theory]
[InlineData("Maria das Graças de Souza", "maria.souza")]
[InlineData("João", "joao")]
[InlineData("Ana-Luísa D'Ávila", "analuisa.davila")]
public void LoginCandidate_UsesFirstAndLastName(string name, string expected) => Assert.Equal(expected, ProfileText.LoginCandidate(name));
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test tests/SipatOnline.Domain.UnitTests --filter FullyQualifiedName~ProfileTextTests`
Expected: FAIL (o tipo `ProfileText` não existe).

- [ ] **Step 3: Implementar `ProfileText`** com as assinaturas acima. As mensagens: `"A matrícula informada não é válida."`, `"O telefone precisa ter DDD e 8 ou 9 dígitos."`, `"O e-mail informado não é válido."`. As partículas valem só quando não são a primeira palavra.

- [ ] **Step 4: Rodar e ver passar**

Run: `dotnet test tests/SipatOnline.Domain.UnitTests --filter FullyQualifiedName~ProfileTextTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Identity/Domain/SipatOnline.Identity.Domain/Users/ProfileText.cs tests/SipatOnline.Domain.UnitTests/Users/ProfileTextTests.cs
git commit -m "feat(identity): standardize names, registration numbers, phones and e-mails"
```

---

### Task 2: Dados e migração

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/PlatformIdentityUser.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/PlatformIdentityUserConfiguration.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/CompanyRegistryEntities.cs` (as três entidades e as três `IEntityTypeConfiguration`)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/PlatformDbContext.cs` (três `DbSet` novos)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/EfUserAccountStore.cs` (`UpdateAsync` liga `DisplayNameLocked` quando o nome muda)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261126100000_AddParticipantProfile.cs` (+ `.Designer.cs`, snapshot)
- Test: `tests/SipatOnline.IntegrationTests/CompanyRegistryApiTests.cs` (arquivo novo; o primeiro teste entra aqui)

**Interfaces:**
- Produces:
  - `PlatformIdentityUser`: `string? RegistrationNumber` (64), `string? Phone` (16), `Guid? UnitId`, `Guid? SectorId`, `bool DisplayNameLocked` (padrão `false`). O e-mail usa `Email`/`NormalizedEmail` do Identity.
  - `CompanyUnitEntity` / `CompanySectorEntity`: `Guid Id`, `Guid TenantId`, `string Name` (100), `string NameKey` (100), `bool IsActive`, `DateTimeOffset CreatedAt`. Tabelas `identity.CompanyUnits` e `identity.CompanySectors`. Índice único `(TenantId, NameKey)`. FK para `TenantEntity` com `Restrict`.
  - `CompanyProfileRulesEntity`: `Guid TenantId` (PK), `bool RequireRegistration`, `RequireEmail`, `RequirePhone`, `RequireUnit`, `RequireSector`. Tabela `identity.CompanyProfileRules`. Sem linha = tudo `false`.
  - FKs `Users.UnitId → CompanyUnits.Id` e `Users.SectorId → CompanySectors.Id`, com `Restrict`. Índices `(TenantId, UnitId)` e `(TenantId, SectorId)` em `Users`, para os filtros do projeto 3.
  - `DbSet`s: `CompanyUnits`, `CompanySectors`, `CompanyProfileRules`.

- [ ] **Step 1: Escrever o teste** `Migration_KeepsExistingParticipantsAndTheirLogin` em `CompanyRegistryApiTests`: inicializa o banco como os outros testes (copiar `InitializeDatabaseAsync` / `SignInAdminAsync` de `IdentityApiTests`), entra com um participante da amostra pelo login que já tinha, e confere pelo `PlatformDbContext` que `RegistrationNumber`, `Phone`, `UnitId` e `SectorId` estão `null` e `DisplayNameLocked` está `false`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter FullyQualifiedName~CompanyRegistryApiTests`
Expected: FAIL (as propriedades não existem; erro de compilação).

- [ ] **Step 3: Adicionar as propriedades, as entidades, as configurações e os `DbSet`s.** Em `EfUserAccountStore.UpdateAsync`, quando `DisplayName` muda, gravar `DisplayNameLocked = true`. Toda renomeação pela tela passa por ali e é manual.

- [ ] **Step 4: Gerar a migração e renomear** para `20261126100000_AddParticipantProfile` (ver Global Constraints). Conferir no `.cs` gerado que nenhuma coluna existente é alterada.

- [ ] **Step 5: Rodar e ver passar**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter "FullyQualifiedName~CompanyRegistryApiTests|FullyQualifiedName~IdentityApiTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/Infrastructure/SipatOnline.Infrastructure tests/SipatOnline.IntegrationTests/CompanyRegistryApiTests.cs
git commit -m "feat(identity): participant profile fields, company units, sectors and required-field rules"
```

---

### Task 3: Listas da empresa e obrigatoriedade (API)

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/CompanyRegistryService.cs`
- Create: `src/Api/SipatOnline.Api/Endpoints/CompanyRegistryEndpoints.cs` (registrar em `Program.cs` junto dos outros `Map…Endpoints`; o serviço vai em `InfrastructureServiceCollectionExtensions` como `Scoped`)
- Test: `tests/SipatOnline.IntegrationTests/CompanyRegistryApiTests.cs`

**Interfaces:**
- Consumes: `ProfileText.CatalogKey` (Task 1); entidades da Task 2.
- Produces:
  - `record RegistryItem(Guid Id, string Name, bool IsActive, int PeopleCount)`
  - `record ProfileRules(bool RequireRegistration, bool RequireEmail, bool RequirePhone, bool RequireUnit, bool RequireSector)`
  - `record CompanyRegistry(IReadOnlyList<RegistryItem> Units, IReadOnlyList<RegistryItem> Sectors, ProfileRules Rules)`
  - `enum RegistryKind { Unit, Sector }`
  - `CompanyRegistryService.GetAsync(CancellationToken) → Result<CompanyRegistry>`
  - `AddAsync(RegistryKind kind, IReadOnlyList<string> names, CancellationToken) → Result<CompanyRegistry>`: aceita várias de uma vez (o "colar várias linhas"). Linhas vazias são ignoradas; um nome cuja chave já existe na empresa (ativo ou não) também é ignorado, sem erro. Nomes passam por trim e junção de espaços, mas **não** por `PersonName`: a grafia do RH fica.
  - `UpdateAsync(RegistryKind kind, Guid id, string? name, bool? isActive, CancellationToken) → Result<RegistryItem>`: renomear para uma chave que já existe dá `registry.name.duplicate` (409).
  - `SaveRulesAsync(ProfileRules rules, CancellationToken) → Result<ProfileRules>`
  - `GetRulesAsync(Guid tenantId, CancellationToken) → ProfileRules` (usado pela Task 4).
  - Rotas, todas no grupo `/api/admin/registry`:
    - `GET /` (policy `ViewTenantLearning`: quem vê participantes também vê as listas, para os filtros);
    - `POST /units` e `POST /sectors` com o corpo `{ names: string[] }`;
    - `PUT /units/{id}` e `PUT /sectors/{id}` com o corpo `{ name?, isActive? }`;
    - `PUT /rules`.
    As escritas usam a policy `ManageTenantUsers`. Erros no mesmo formato `ToProblem` de `UserManagementEndpoints`.
  - A autorização segue `EmployeeCredentialService.FindEmployeeAsync`: `SuperAdmin`, `ClientAdmin` ou `PlatformOperator`, sempre com a empresa no contexto (o operador chega pelo cabeçalho `X-Sipat-Company`). Cada escrita grava auditoria: `identity.registry.unit_added`, `…unit_updated`, `…sector_added`, `…sector_updated`, `identity.registry.rules_changed`.

- [ ] **Step 1: Escrever os testes** em `CompanyRegistryApiTests`:
  - `Admin_PastesSectors_DuplicatesByAccentAreIgnored`: `POST /sectors` com `["Tecnologia da Informação", "tecnologia da informacao", "", "Produção"]` → 2 setores, com a grafia do primeiro.
  - `Admin_RenamesToAnExistingName_GetsConflict`: 409 com `registry.name.duplicate`.
  - `Admin_DeactivatesSector_PeopleKeepIt`: liga um participante ao setor pelo `DbContext`, desativa e confere que `SectorId` continua, `IsActive` está `false` e `PeopleCount` é 1.
  - `Rules_StartAllOff_AndSave`: o `GET` inicial vem com tudo `false`; depois do `PUT` com `RequireSector = true`, o `GET` devolve `true`.
  - `Registry_IsTenantScoped`: o administrador de outra empresa não vê nem altera (404 no `PUT` de um id alheio).
  - `Participant_CannotChangeRegistry`: 403.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter FullyQualifiedName~CompanyRegistryApiTests`
Expected: FAIL (404 nas rotas).

- [ ] **Step 3: Implementar o serviço e as rotas.** `PeopleCount` conta participantes ativos e inativos ligados ao item. A ordem é por `Name`.

- [ ] **Step 4: Rodar e ver passar** (mesmo comando). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Infrastructure/SipatOnline.Infrastructure/Identity/CompanyRegistryService.cs src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs src/Api/SipatOnline.Api tests/SipatOnline.IntegrationTests/CompanyRegistryApiTests.cs
git commit -m "feat(api): company units, sectors and required fields"
```

---

### Task 4: Carga de participantes no back (prévia e gravação)

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/ParticipantImportService.cs`
- Modify: `src/Api/SipatOnline.Api/Endpoints/UserManagementEndpoints.cs` (rota nova)
- Test: `tests/SipatOnline.IntegrationTests/ParticipantImportApiTests.cs`

**Interfaces:**
- Consumes: `ProfileText` (Task 1); `CompanyRegistryService.GetRulesAsync` (Task 3); `LearningDistributionService.EnsureAssignmentsAsync(tenantId, null, token)`; `UserManager<PlatformIdentityUser>` para criar com senha e perfil `Participant`.
- Produces:
  - `record ImportRow(int Row, string? Name, string? Login, string? RegistrationNumber, string? Email, string? Phone, string? Unit, string? Sector, string? Password)`. `Row` é o número da linha na planilha, informado pelo front. Um campo `null` ou só com espaços significa "não informado".
  - `record ImportRequest(bool DryRun, IReadOnlyList<ImportRow> Rows)`
  - `record ImportRejection(int Row, string? Login, string Message)`
  - `record ImportCredential(int Row, string Name, string Login)`: as pessoas criadas. O front junta com a senha que ele mesmo mandou.
  - `record ImportResult(int Created, int Updated, int Unchanged, IReadOnlyList<ImportRejection> Rejected, IReadOnlyList<ImportCredential> Credentials)`. Na prévia, `Credentials` traz os logins que **seriam** criados, já com os gerados.
  - `ParticipantImportService.ImportAsync(ImportRequest request, CancellationToken) → Result<ImportResult>`
  - `POST /api/admin/users/import` (policy `ManageTenantUsers`) → 200 com `ImportResult`; mais de 2000 linhas → 400 `import.too_many_rows`.

**Regras de cada linha, nesta ordem** (a primeira que falha recusa a linha com a mensagem entre aspas):
1. Padroniza matrícula, telefone e e-mail com `ProfileText`. Se falhar, usa a mensagem do `ProfileText`.
2. Procura a pessoa: pela chave normalizada (`LoginIdentifier.Create(...).NormalizedValue`) de `Login`, ou de `RegistrationNumber` quando `Login` não vem, entre os **participantes** da empresa. Achou um administrador com esse login: "Esse login é de um administrador.".
3. Unidade e setor: buscados por `CatalogKey` entre os itens **ativos** da empresa. Se não acha: "Unidade \"X\" não está na lista da empresa." / "Setor \"X\" não está na lista da empresa."
4. **Atualizar** (achou a pessoa): só os campos informados mudam. O nome muda (padronizado) se veio e se `DisplayNameLocked` é `false`. Se nada muda, conta em `Unchanged`. A senha é ignorada. A pessoa inativa continua inativa.
5. **Criar** (não achou):
   - Sem nome: "Informe o nome.".
   - Falta um obrigatório da empresa: "Falta a matrícula, obrigatória nesta empresa." (e o mesmo para e-mail, telefone, unidade e setor).
   - Sem login e sem matrícula, e já existe participante com o mesmo `CatalogKey(PersonName(nome))`: "Já existe um colaborador com esse nome. Informe o login para atualizar.".
   - Sem senha, ou senha que o Identity recusa: "A senha inicial não atende aos requisitos.".
   - O login é `Login` ou `RegistrationNumber`; se nenhum vier, é `ProfileText.LoginCandidate(nome)` com sufixo `2`, `3`… até não colidir com o banco nem com outra linha da mesma carga.
6. Duas linhas da mesma carga com a mesma pessoa (mesma chave de login), ou dois nomes iguais sem login nem matrícula: a segunda é recusada com "Linha repetida: a mesma pessoa já está na linha N.".

A gravação (`DryRun = false`) roda numa transação só (`db.Database.BeginTransactionAsync`). Se alguma criação falhar no Identity por um motivo que não é da linha (por exemplo, violação de unicidade por concorrência), a carga inteira volta e o erro é `import.failed`. Depois do commit, se `Created > 0`, chama `EnsureAssignmentsAsync(tenant, null, token)`. Grava uma auditoria `identity.users.imported` com `Created`/`Updated` no `ResourceId` (`"created=N;updated=M"`).

- [ ] **Step 1: Escrever os testes** em `ParticipantImportApiTests`, cada um `[DockerFact]` com as listas criadas pela API da Task 3:
  - `DryRun_ReportsAndSavesNothing`: 3 linhas novas → `Created = 3`, e no banco nada mudou.
  - `Import_CreatesWithStandardizedData`: `"MARIA DAS GRAÇAS"`, matrícula `"12.345-6"`, setor `"tecnologia da informacao"` → usuário `"Maria das Graças"`, login `"123456"`, `RegistrationNumber = "123456"`, `SectorId` igual ao de "Tecnologia da Informação"; ela entra com `123456` e a senha enviada.
  - `Import_GeneratesLoginsWithoutCollision`: já existe `maria.silva`; duas linhas "Maria Silva" e "Maria Souza Silva", sem login → logins `maria.silva2` e `maria.silva3`.
  - `Import_UnknownSector_RejectsLineOnly`: uma linha boa e uma com setor `"Marketing"` (fora da lista) → 1 criada, 1 recusada com a mensagem exata.
  - `Import_RequiredFieldMissing_RejectsNewOnly`: `RequireSector = true`; uma linha nova sem setor é recusada; uma atualização parcial (login + e-mail) de alguém sem setor passa.
  - `Import_EmptyCellKeepsExistingData`: a pessoa tem telefone; uma linha com login + setor e telefone `""` → o telefone continua.
  - `Import_PartialSheetUpdatesSectorOnly`: só `Login` + `Sector` → `Updated = 1`, nome e login iguais.
  - `Import_SameSheetTwice_NoDuplicates` (Review Focus 1): a mesma carga sem login nem matrícula, duas vezes → na segunda, `Created = 0` e todas as linhas são recusadas com a mensagem de nome repetido.
  - `Import_RepeatedLineInSameSheet_RejectsSecond` (Review Focus 2).
  - `Import_NewPersonGetsPublishedTrainingDays` (Review Focus 4): com o treinamento publicado da amostra, a pessoa criada tem as `LearningAssignments` dos dias dele.
  - `Import_DoesNotTouchAdministrators`: uma linha com o login de um administrador é recusada.
  - `Import_MoreThan2000Rows_IsRefused`: 400 com `import.too_many_rows`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter FullyQualifiedName~ParticipantImportApiTests`
Expected: FAIL (404 na rota).

- [ ] **Step 3: Implementar `ParticipantImportService` e a rota** seguindo as regras acima. Carregar de uma vez: os participantes da empresa (login normalizado, chave do nome), as listas e as regras. Nada de consulta por linha.

- [ ] **Step 4: Rodar e ver passar** (mesmo comando). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Infrastructure/SipatOnline.Infrastructure/Identity/ParticipantImportService.cs src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs src/Api/SipatOnline.Api/Endpoints/UserManagementEndpoints.cs tests/SipatOnline.IntegrationTests/ParticipantImportApiTests.cs
git commit -m "feat(api): participant import with preview, standardization and generated logins"
```

---

### Task 5: Cadastro de cada participante e mudança em lote (API)

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/ParticipantProfileService.cs`
- Modify: `src/Api/SipatOnline.Api/Endpoints/UserManagementEndpoints.cs`
- Test: `tests/SipatOnline.IntegrationTests/ParticipantProfileApiTests.cs`

**Interfaces:**
- Consumes: `ProfileText` (Task 1); a busca de participante de `EmployeeCredentialService.FindEmployeeAsync` (mesma regra de perfil e empresa; extrair para um método `internal static` compartilhado se for preciso).
- Produces:
  - `record ParticipantProfile(Guid Id, string? RegistrationNumber, string? Email, string? Phone, Guid? UnitId, Guid? SectorId)`
  - `GET /api/admin/users/participants/profiles` (policy `ViewTenantLearning`) → `ParticipantProfile[]` de todos os participantes da empresa, sem paginação. O front junta com `listAllParticipants` pelo `Id`.
  - `PUT /api/admin/users/{userId}/profile` com o corpo `{ registrationNumber, email, phone, unitId, sectorId }` → `ParticipantProfile`. Aqui o campo vazio **limpa**, porque é um formulário. Unidade ou setor precisam ser da empresa, e ativos, a menos que sejam os que a pessoa já tem. Senão: `profile.unit.invalid` / `profile.sector.invalid`.
  - `PUT /api/admin/users/placement` com o corpo `{ userIds: Guid[], field: "unit" | "sector", valueId: Guid | null }` → `{ changed: int }`. `null` tira a unidade ou o setor. No máximo 2000 ids. Ids que não são participantes da empresa são ignorados.
  - Auditoria: `identity.user.profile_changed` (por pessoa) e `identity.users.placement_changed` (`ResourceId = "unit:N"` ou `"sector:N"`).

- [ ] **Step 1: Escrever os testes** em `ParticipantProfileApiTests`:
  - `Profile_SavesStandardizedFields`: `"12.345-6"`, `" Ana@X.COM "`, `"(27) 99999-1234"` → `"123456"`, `"ana@x.com"`, `"27999991234"`. O login não muda.
  - `Profile_EmptyFieldClears`.
  - `Profile_InactiveSectorNotAllowedUnlessCurrent`.
  - `Placement_MovesManyToSector` e `Placement_NullRemovesSector`.
  - `Placement_IgnoresOtherCompanyIds`.
  - `ManualRename_IsNotOverwrittenByImport` (Review Focus 5): `PUT display-name` "Maria D'Avila", depois uma carga com o mesmo login e nome "MARIA D AVILA" → o nome continua "Maria D'Avila", e uma carga com o mesmo login e só o setor atualiza o setor.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter FullyQualifiedName~ParticipantProfileApiTests`
Expected: FAIL

- [ ] **Step 3: Implementar o serviço e as rotas.**

- [ ] **Step 4: Rodar e ver passar** (mesmo comando, e depois `dotnet test tests/SipatOnline.IntegrationTests` inteiro). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Infrastructure/SipatOnline.Infrastructure/Identity src/Api/SipatOnline.Api/Endpoints/UserManagementEndpoints.cs tests/SipatOnline.IntegrationTests/ParticipantProfileApiTests.cs
git commit -m "feat(api): edit a participant's registration, contact, unit and sector, one or many at a time"
```

---

### Task 6: Tela "Cadastro" (listas e obrigatórios)

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (tipos e funções)
- Create: `src/Web/SipatOnline.Web/src/registry/RegistryPage.tsx`
- Create: `src/Web/SipatOnline.Web/src/registry/RegistryList.tsx` (uma lista: adicionar, colar várias linhas, renomear, ativar/desativar)
- Modify: `src/Web/SipatOnline.Web/src/App.tsx` (rota `/admin/cadastro` e o link "Cadastro" no menu, ao lado de "Participantes", só para `hasAdminRole`)
- Test: `src/Web/SipatOnline.Web/src/registry/RegistryPage.test.tsx`

**Interfaces:**
- Consumes: as rotas da Task 3.
- Produces em `api.ts`:
  - `interface RegistryItem { id: string; name: string; isActive: boolean; peopleCount: number }`
  - `interface ProfileRules { requireRegistration: boolean; requireEmail: boolean; requirePhone: boolean; requireUnit: boolean; requireSector: boolean }`
  - `interface CompanyRegistry { units: RegistryItem[]; sectors: RegistryItem[]; rules: ProfileRules }`
  - `getCompanyRegistry()`, `addRegistryItems(kind: 'units' | 'sectors', names: string[])`, `updateRegistryItem(kind, id, change: { name?: string; isActive?: boolean })`, `saveProfileRules(rules)`, todas retornando o mesmo que a API.

A página tem duas colunas, Unidades e Setores (empilhadas no celular). Em cada uma:
- um campo de texto de várias linhas com "Cole um nome por linha" e o botão "Adicionar";
- a lista com o nome, "N pessoas" e um menu com "Renomear" e "Desativar"/"Reativar";
- os desativados aparecem por último, com a etiqueta "Desativado".

Embaixo, o quadro "Campos obrigatórios" com cinco caixas (Matrícula, E-mail, Telefone, Unidade, Setor) e o texto fixo "Nome e senha são sempre obrigatórios. Ligar um campo vale para quem for cadastrado daqui em diante." Cada caixa salva ao marcar e mostra o aviso "Salvo.".

O operador chega a esta tela pelo painel da empresa (o modo `/admin` com `X-Sipat-Company`), do mesmo jeito que já chega em Participantes.

- [ ] **Step 1: Escrever os testes** (mock de `@/api`, como em `CollaboratorsPage.test.tsx`):
  - `colar três linhas chama addRegistryItems com os três nomes, sem as linhas vazias`;
  - `desativar chama updateRegistryItem com isActive false e mostra "Desativado"`;
  - `marcar Setor salva as regras com requireSector true`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix src/Web/SipatOnline.Web test -- registry`
Expected: FAIL

- [ ] **Step 3: Implementar.** Usar os componentes de `@/components/ui` (`Page`, `PageHeader`, `Button`, `Input`, `Badge`, `Field`), como em `CollaboratorsPage`.

- [ ] **Step 4: Rodar e ver passar** (mesmo comando, e depois `npm --prefix src/Web/SipatOnline.Web run lint`). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Web/SipatOnline.Web/src/api.ts src/Web/SipatOnline.Web/src/registry src/Web/SipatOnline.Web/src/App.tsx
git commit -m "feat(web): company registry screen with units, sectors and required fields"
```

---

### Task 7: Participantes com unidade e setor (colunas, filtros, edição, lote)

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`ParticipantProfile`, `listParticipantProfiles()`, `saveParticipantProfile(id, data)`, `changePlacement(userIds, field, valueId)`)
- Modify: `src/Web/SipatOnline.Web/src/collaborators/CollaboratorsPage.tsx`
- Modify: `src/Web/SipatOnline.Web/src/collaborators/EditCollaboratorDialog.tsx`
- Create: `src/Web/SipatOnline.Web/src/collaborators/PlacementDialog.tsx`
- Create: `src/Web/SipatOnline.Web/src/collaborators/profileFilter.ts` (função pura)
- Test: `src/Web/SipatOnline.Web/src/collaborators/profileFilter.test.ts`, `src/Web/SipatOnline.Web/src/collaborators/CollaboratorsPage.test.tsx`

**Interfaces:**
- Consumes: as rotas das Tasks 3 e 5.
- Produces:
  - `type PlacementFilter = 'all' | 'none' | string` (id da unidade ou do setor; `'none'` é "Sem unidade" / "Sem setor").
  - `filterByPlacement<T extends { id: string }>(people: T[], profiles: Map<string, ParticipantProfile>, unit: PlacementFilter, sector: PlacementFilter): T[]`.

Mudanças:
- **Participantes:**
  - carrega também `listParticipantProfiles()` e `getCompanyRegistry()`;
  - ganha as colunas "Unidade" e "Setor" (com "—" quando não há);
  - ganha dois `NativeSelect` de filtro ("Todas as unidades", "Sem unidade", cada unidade; o mesmo para setor), combinados com o filtro de treinamento e de situação que já existem;
  - os filtros só aparecem quando a lista correspondente tem algum item;
  - quando uma regra está ligada e há gente sem o campo, mostra o aviso "N pessoas sem setor" (e o mesmo para unidade, matrícula, e-mail e telefone), com um botão que aplica o filtro "Sem setor" (só para unidade e setor; os outros só informam).
- **Lote:**
  - com pessoas marcadas, ao lado de "Inativar", aparecem "Mudar unidade" e "Mudar setor" (`PlacementDialog`: um `NativeSelect` com os itens ativos e "Tirar a unidade"/"Tirar o setor");
  - a caixa "Selecionar todos os listados", que já existe, passa a respeitar também os filtros de unidade e setor;
  - o aviso do resultado: "12 colaboradores passaram para Produção.".
- **Editar colaborador:**
  - campos novos "Matrícula", "E-mail", "Telefone", e "Unidade" e "Setor" como `NativeSelect` com os ativos mais o atual (mesmo desativado, com "(desativado)" no texto);
  - se algum desses mudou, chama `saveParticipantProfile` uma vez, depois dos que já existem, e junta "cadastro" à lista de `done`;
  - os campos que a empresa tornou obrigatórios mostram "(obrigatório nesta empresa)" na etiqueta, mas não bloqueiam salvar: a regra vale ao criar.

- [ ] **Step 1: Escrever os testes**
  - `profileFilter.test.ts`: `'none'` devolve quem não tem setor; um id devolve só os daquele setor; unidade + setor combinam com **E**.
  - `CollaboratorsPage.test.tsx`:
    - `filtra por setor e mostra a coluna`;
    - `muda o setor de duas pessoas marcadas e chama changePlacement(['a','b'], 'sector', id)`;
    - `com RequireSector ligado mostra "1 pessoa sem setor"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix src/Web/SipatOnline.Web test -- collaborators`
Expected: FAIL

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar e ver passar** (mesmo comando, e depois `run lint`). Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Web/SipatOnline.Web/src/api.ts src/Web/SipatOnline.Web/src/collaborators
git commit -m "feat(web): unit and sector in Participants: columns, filters, editing and moving many at once"
```

---

### Task 8: Carga do RH na tela (CSV ou Excel, modelo, prévia)

**Files:**
- Create: `src/Web/SipatOnline.Web/src/collaborators/importSheet.ts` (lê o arquivo e mapeia colunas, sem React)
- Modify: `src/Web/SipatOnline.Web/src/collaborators/AddCollaboratorsDialog.tsx`
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`ImportRow`, `ImportResult`, `importParticipants(dryRun, rows)`)
- Modify: `src/Web/SipatOnline.Web/src/participantCsv.ts` (remover `parseParticipantCsv` e `createParticipantsFromCsv` quando não houver mais uso; manter `generateInitialPassword` e `serializeCredentialCsv`)
- Test: `src/Web/SipatOnline.Web/src/collaborators/importSheet.test.ts`, `src/Web/SipatOnline.Web/src/participantCsv.test.ts` (tirar os testes do que foi removido)

**Interfaces:**
- Consumes: a rota da Task 4; `getCompanyRegistry` (Task 6) para o modelo.
- Produces:
  - `readSheet(file: File): Promise<SheetReadResult>`, com `type SheetReadResult = { rows: ImportRow[]; fatalError?: string }`. Aceita `.csv` (reaproveitando o parser de registros e a detecção de delimitador que já estão em `participantCsv.ts`; mover para `importSheet.ts`) e `.xlsx` (ExcelJS com `import('exceljs')` dinâmico, primeira planilha, primeira linha como cabeçalho). `row` é o número da linha na planilha (cabeçalho = 1). Linhas totalmente vazias são puladas.
  - `mapHeader(header: string): keyof ImportRow | null`, comparando sem acento e sem diferença de maiúsculas. Os sinônimos:
    - `name`: nome, nome completo, colaborador, funcionario;
    - `login`: login, usuario;
    - `registrationNumber`: matricula, registro, re, chapa;
    - `email`: email, e-mail, e mail;
    - `phone`: telefone, celular, whatsapp, fone;
    - `unit`: unidade, filial, planta, unidade organizacional;
    - `sector`: setor, departamento, area.
    Sem nenhuma coluna reconhecida: `fatalError` "Não reconhecemos as colunas. Use o modelo." Sem `name` e sem `login`/`registrationNumber`: "A planilha precisa da coluna nome ou da coluna login/matrícula."
  - Célula do Excel: número inteiro vira texto sem casas (`123456`, não `123456.0` nem notação científica); data vira `dd/mm/aaaa`; fórmula usa o resultado; texto rico usa o texto.
  - `downloadTemplate(registry: CompanyRegistry): Promise<void>`: gera `modelo-carga-participantes.xlsx` com a aba "Participantes" (cabeçalho Nome, Login, Matrícula, E-mail, Telefone, Unidade, Setor, mais uma linha de exemplo) e a aba "Listas válidas" (as unidades e os setores **ativos**, em duas colunas).

O diálogo:
- **"Um colaborador":** campos Nome, Matrícula (opcional), Login (opcional, com a dica "Se ficar em branco, usamos a matrícula ou criamos um login."), E-mail, Telefone, Unidade e Setor (só aparecem se a lista tem itens) e Senha inicial. O botão chama `importParticipants(false, [row])` e mostra o login usado ("Maria Silva foi adicionada. Login: maria.silva."), ou a recusa da linha como erro.
- **"Importar planilha"** (o nome antigo era "Importar de um CSV"):
  - aceita `.csv,.xlsx` e tem o botão "Baixar modelo";
  - ao escolher o arquivo, o front gera uma senha (`generateInitialPassword`) para cada linha e chama `importParticipants(true, rows)`;
  - mostra "N serão criados · M atualizados · K sem mudança · R recusados", com a lista de recusas ("Linha 12 · maria.silva: Setor \"Marketing\" não está na lista da empresa.", as 8 primeiras mais "e mais N");
  - o botão "Confirmar carga" chama `importParticipants(false, rows)` com as **mesmas** senhas;
  - depois, como hoje, obriga a baixar o arquivo de acessos (`serializeCredentialCsv`, juntando `credentials` com as senhas por `row`) antes de fechar, se alguém foi criado;
  - o limite passa a ser 2000 linhas e 5 MiB.

- [ ] **Step 1: Escrever os testes** em `importSheet.test.ts`:
  - `mapHeader reconhece "Nome completo", "Matrícula", "E-mail", "Celular", "Departamento"` (Review Focus 3);
  - `CSV com ponto e vírgula vira ImportRow com row = 2 na primeira linha de dados`;
  - `xlsx com matrícula numérica 123456 vira "123456"`: montar o arquivo no teste com ExcelJS (`workbook.xlsx.writeBuffer()` → `File`);
  - `planilha só com login e setor vira linhas sem name, sem erro fatal`;
  - `planilha sem colunas conhecidas dá o erro fatal exato`.

  E em `CollaboratorsPage.test.tsx`, o teste `a carga mostra a prévia, confirma com as mesmas senhas e exige baixar os acessos`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix src/Web/SipatOnline.Web test -- importSheet collaborators participantCsv`
Expected: FAIL

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar e ver passar** (mesmo comando, e depois `npm --prefix src/Web/SipatOnline.Web test` inteiro e `run lint`). Expected: PASS

- [ ] **Step 5: Atualizar o manual.** Em `docs/manual/manual.html`, na seção de participantes, descrever as listas de unidades e setores, os campos obrigatórios, a carga por planilha com prévia e a mudança de setor em lote.

- [ ] **Step 6: Commit**

```bash
git add src/Web/SipatOnline.Web/src docs/manual/manual.html
git commit -m "feat(web): HR load from CSV or Excel with template, preview and one call to the server"
```

---

### Task 9: Verificação no app

- [ ] **Step 1:** Rodar `dotnet test` (todas as suítes) e `npm --prefix src/Web/SipatOnline.Web test`. Expected: tudo PASS.
- [ ] **Step 2:** Subir o app (`preview_start` com `web-branch`, de `.claude/launch.json`) e, como administrador da empresa de amostra:
  - cadastrar 2 unidades e 3 setores colando linhas;
  - baixar o modelo e conferir a aba "Listas válidas";
  - carregar um .xlsx de 5 linhas (uma com setor errado, uma sem login);
  - conferir a prévia e confirmar;
  - baixar os acessos;
  - entrar com um login gerado;
  - em Participantes, filtrar "Sem setor", marcar duas pessoas e mudar o setor;
  - ligar "Setor obrigatório" e ver o aviso.
- [ ] **Step 3:** Conferir que um participante que já existia antes da migração entra com o mesmo login e vê os mesmos dias.
- [ ] **Step 4:** Não commitar mudanças em `src/Web/SipatOnline.Web/dist`. O `54e01db` restaurou o build versionado de propósito: se `npm run build` alterar o `dist`, rodar `git checkout -- src/Web/SipatOnline.Web/dist`.
