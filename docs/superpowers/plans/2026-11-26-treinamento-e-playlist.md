# Treinamento é uma playlist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela deixa de tratar "Conteúdo" e "Treinamento" como coisas diferentes: existe um objeto só, o **Treinamento**, uma playlist de vídeos (com jogos) e com período de liberação. "Assunto" fica sendo só a etiqueta dos vídeos e dos jogos.

**Architecture:** O banco já segue esse modelo. O treinamento da operação e o de uma empresa são o mesmo `PlatformCourseEntity`. A única diferença é o `TenantId`, que é nulo quando o treinamento é da operação. O período fica nos dias (`PlatformCourseLessonEntity.Date`) e no `SipatEventEntity`. Por isso a mudança é só de interface: nome do menu, títulos, filtros e textos do painel do super admin e do planejador. Backend, rotas e dados não mudam.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4/shadcn, Vitest + Testing Library (`src/Web/SipatOnline.Web`).

**Spec:** Conversa de 26/11/2026 entre Rafael Ezequiel e Rafael Palma, sem documento à parte. Pontos do Palma, citados: "O Treinamento é meio que uma playlist"; "Conteúdo e treinamento é a mesma coisa"; "Assuntos são tag, marcadores dos vídeos"; "E o vídeos é o catálogo de materiais"; e "Tem uma data de liberação de início e fim".

## Global Constraints

- O termo na interface é **"Treinamento"**. Não usar "Conteúdo" para nomear o objeto, nem "modelo", "acervo", "Formação" ou "trilha".
- **"Assunto"** só aparece como etiqueta de vídeo ou de jogo, nunca como nome de um treinamento.
- Os vídeos continuam em **"Biblioteca de vídeos"** (`/platform/videos`), que é o catálogo de materiais.
- **Rotas não mudam:** `/platform/courses` e `/platform/courses/:courseId/edit` ficam iguais, para não quebrar links salvos. Muda só o rótulo.
- **Estilo só com Tailwind,** sem CSS novo.
- **Sem testes novos.** Só ajustar as asserções existentes que citam os textos trocados. Um commit por task. O CI do GitHub valida.
- O dono do treinamento continua aparecendo no card e no filtro. "Da operação" é o treinamento com `tenantId` nulo, pronto para uma empresa copiar.

## Fora deste plano

- **Categorias de treinamento** (`CourseCategory`, filtro "Categoria", "Gerenciar categorias"). A área do participante usa as categorias (`learning/LearningHomePage.tsx`, `learningHelpers.ts`). Tirá-las pede decidir antes como o participante agrupa os treinamentos.
- **Juntar os dois editores** (a grade do planejador e o editor de vídeos `CourseEditor`). É a mesma playlist em duas telas, mas é um projeto à parte.
- **Período no treinamento da operação.** Ele não tem datas até ser copiado para uma empresa. O card mostra "Sem datas", sem campo novo.

## Review Focus

1. **Link antigo com `?empresa=models`** (a visão salva em `sessionStorage` `sipat-library-view`): o filtro continua funcionando e mostra os treinamentos da operação. O valor interno `models` fica igual e só muda o texto da opção.
2. **Plano Bronze no planejador:** a bandeja continua arrastando um treinamento pronto para um dia, com os mesmos vídeos e jogos. Muda só o texto, não o `applyTheme`.
3. **Prata ou acima no planejador:** "Filtrar por assunto" continua usando as etiquetas dos vídeos (`catalog.filters`), sem mudança.
4. **Leitor de tela:** os `aria-label` trocados (bandeja, busca, botão de arrastar) batem com o texto visível, porque os testes buscam por nome acessível.
5. **Editor aberto pela semana da SIPAT:** o botão continua "Voltar à semana", e só a frase de ajuda perde a menção ao Conteúdo.

---

### Task 1: O menu e a página do super admin viram "Treinamentos"

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/App.tsx:664`: o rótulo do NavLink `/platform/courses` passa de `Conteúdo` para `Treinamentos`.
- Modify: `src/Web/SipatOnline.Web/src/courseCatalog/CourseCatalog.tsx:174,205,207,210`
- Modify: `src/Web/SipatOnline.Web/src/courseCatalog/CatalogToolbar.tsx:80-81`
- Modify: `src/Web/SipatOnline.Web/src/PlatformCoursesPage.tsx:23,32,112,140-141,156`
- Modify: `src/Web/SipatOnline.Web/src/courseEditor/CourseEditorFrame.tsx:78,89`
- Modify: `src/Web/SipatOnline.Web/src/courseEditor/CourseConfigureStep.tsx:117`
- Modify: `src/Web/SipatOnline.Web/src/api.ts:77,732` (só comentários)
- Test: `src/Web/SipatOnline.Web/src/App.test.tsx:530`, `src/Web/SipatOnline.Web/src/PlatformCoursesPage.test.tsx:592,594,882,886`

**Interfaces:**
- Consumes: nada.
- Produces: nada que outra task use. As props, os tipos e os valores de filtro (`owner: 'all' | 'models' | <tenantId>`) não mudam.

- [ ] **Step 1: Trocar os textos**

| Onde | Antes | Depois |
|---|---|---|
| `App.tsx:664` | `Conteúdo` | `Treinamentos` |
| `CourseCatalog.tsx:205` eyebrow | `Acervo da plataforma` | `Plataforma` |
| `CourseCatalog.tsx:207` h1 | `Conteúdo` | `Treinamentos` |
| `CourseCatalog.tsx:210` lead | `${n} no acervo da plataforma` | `${pluralize(courses.length, 'treinamento', 'treinamentos')}, da operação e das empresas` |
| `CourseCatalog.tsx:174` confirm | `…As empresas que já receberam este conteúdo continuam com o conteúdo, e os vídeos continuam na biblioteca.` | `…As empresas que já copiaram este treinamento continuam com a cópia delas, e os vídeos continuam na biblioteca.` |
| `CatalogToolbar.tsx:80` | `Modelos e empresas` | `Todos os treinamentos` |
| `CatalogToolbar.tsx:81` | `Só modelos` | `Da operação` |
| `PlatformCoursesPage.tsx:156` notice | `O treinamento "${t}" foi criado no catálogo global.` | `O treinamento "${t}" foi criado.` |
| `CourseEditorFrame.tsx:78` | `Voltar ao conteúdo` | `Voltar aos treinamentos` |
| `CourseEditorFrame.tsx:89` | `…vai para os dias da semana; o treinamento original do Conteúdo não muda.` | `…vai para os dias da semana.` |
| `CourseConfigureStep.tsx:117` | `…identificar o conteúdo no catálogo.` | `…identificar o treinamento na lista.` |

Os comentários de `PlatformCoursesPage.tsx:23,32,112` e `api.ts:77,732` que dizem "Conteúdo" ou "model of Conteúdo" passam a dizer "the operation's trainings (no company)".

- [ ] **Step 2: Ajustar as asserções**

`App.test.tsx:530`: `getByRole('link', { name: 'Treinamentos' })` com href `/platform/courses`. Se outro link do mesmo teste também se chamar "Treinamentos", filtrar pelo href.
`PlatformCoursesPage.test.tsx:592`: heading `Treinamentos` nível 1.
`PlatformCoursesPage.test.tsx:594`: `'2 treinamentos, da operação e das empresas'`.
`PlatformCoursesPage.test.tsx:882,886`: botão `'← Voltar aos treinamentos'`.

- [ ] **Step 3: Rodar**

Run: `cd src/Web/SipatOnline.Web; npm run lint; npx vitest run src/App.test.tsx src/PlatformCoursesPage.test.tsx`
Expected: tsc sem erros, e todos os testes passam.

- [ ] **Step 4: Procurar o que sobrou**

Run: `rg -n "Conteúdo|acervo|Só modelos" src/Web/SipatOnline.Web/src/courseCatalog src/Web/SipatOnline.Web/src/PlatformCoursesPage.tsx src/Web/SipatOnline.Web/src/courseEditor`
Expected: só o "Conteúdo" que significa o conteúdo de um jogo (`GameContentEditor.tsx`, `CoursePropertiesPanel.tsx:114`) e `aria-label="Propriedades do conteúdo"`. Esses ficam.

- [ ] **Step 5: Commit**

```powershell
git add src/Web/SipatOnline.Web/src
git commit -m "feat(web): Conteúdo becomes Treinamentos: one list of trainings, the operation's and the companies'"
```

### Task 2: No planejador, treinamento é treinamento e assunto é etiqueta

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/BuilderSetup.tsx:17,45`
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/ThemeCards.tsx:56,67,76-77,83,93,108`
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.tsx:105,295,503`
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatsPage.tsx:43,108,189`, `src/Web/SipatOnline.Web/src/sipatBuilder/model.ts:73,75,105`, `src/Web/SipatOnline.Web/src/trainings/TrainingEditorPage.tsx:13` (só comentários)
- Test: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.test.tsx`, `src/Web/SipatOnline.Web/src/sipatBuilder/SipatsPage.test.tsx`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: nada. `Subject`, `Catalog`, `ThemeTray` e `applyTheme` ficam com os mesmos nomes e tipos. O renomear interno `Subject → ReadyTraining` fica fora, para o diff continuar só de texto.

- [ ] **Step 1: Trocar os textos.** Só o ramo Bronze, `current !== 'videos'`. O ramo Prata (`'videos'`) não muda.

| Onde | Antes | Depois |
|---|---|---|
| `BuilderSetup.tsx:45` label | `Começar de um treinamento do Conteúdo` | `Começar de um treinamento pronto` |
| `ThemeCards.tsx:56` aria-label | `Assuntos do acervo` | `Treinamentos prontos` |
| `ThemeCards.tsx:67` h2 | `Assuntos do acervo` | `Treinamentos prontos` |
| `ThemeCards.tsx:76-77` busca (aria e placeholder) | `Buscar assunto` | `Buscar treinamento` |
| `ThemeCards.tsx:83` dica | `Arraste para um dia e ele traz todos os vídeos e jogos.` | `Arraste um treinamento para um dia: ele traz todos os vídeos e jogos.` |
| `ThemeCards.tsx:93` vazio | `Ainda não há assuntos no acervo. Crie em Conteúdo.` / `Nenhum assunto encontrado.` | `Ainda não há treinamentos prontos. Crie em Treinamentos.` / `Nenhum treinamento encontrado.` |
| `ThemeCards.tsx:108` botão | `Arrastar o assunto ${title}` | `Arrastar o treinamento ${title}` |
| `SipatBuilderPage.tsx:503` aviso | `O acervo ainda não tem assuntos publicados. Peça à operação para publicar os assuntos.` | `Ainda não há treinamentos prontos publicados. Peça à operação para publicar um.` |

Os comentários de `BuilderSetup.tsx:17`, `SipatBuilderPage.tsx:105,295`, `SipatsPage.tsx:43,108,189`, `model.ts:73,75,105` e `TrainingEditorPage.tsx:13` trocam "Conteúdo" por "the operation's trainings" ou "Treinamentos (the operation's list)".

- [ ] **Step 2: Ajustar as asserções.** Rodar `rg -n "Assuntos do acervo|Buscar assunto|Arrastar o assunto|treinamento do Conteúdo|assuntos publicados" src/Web/SipatOnline.Web/src` e trocar cada achado em `*.test.tsx` pelo texto novo da tabela.

- [ ] **Step 3: Rodar**

Run: `cd src/Web/SipatOnline.Web; npm run lint; npx vitest run src/sipatBuilder`
Expected: tsc sem erros, e todos os testes passam.

- [ ] **Step 4: Suíte inteira**

Run: `cd src/Web/SipatOnline.Web; npm test`
Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```powershell
git add src/Web/SipatOnline.Web/src
git commit -m "feat(web): the planner offers ready trainings, not assuntos; assunto is only the videos' tag"
```

### Task 3: Conferir na tela

- [ ] **Step 1:** `.\docker-local.ps1 up -Build` e entrar como super admin em http://localhost:8088.
- [ ] **Step 2:** O menu mostra "Treinamentos". A página tem o título "Treinamentos", e o filtro de dono oferece "Todos os treinamentos" e "Da operação". Abrir um treinamento e voltar: o botão diz "Voltar aos treinamentos".
- [ ] **Step 3:** Numa empresa Bronze, em "Novo treinamento", aparece "SIPAT pronta". Na grade, a bandeja diz "Treinamentos prontos" e arrastar um card preenche o dia. Numa empresa Prata ou acima, a bandeja é "Lista completa" com "Filtrar por assunto".
- [ ] **Step 4:** Tirar um screenshot de cada tela para o usuário.
