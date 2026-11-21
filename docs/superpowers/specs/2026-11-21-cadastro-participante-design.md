# Cadastro do participante: campos, listas padrão e carga do RH

Data: 2026-11-21 · Projeto 2 de 5 · Depende de: nada · Usado por: projetos 3 e 4

## Por quê

A plataforma vai ser de uso permanente, para todos os treinamentos internos da empresa. O acompanhamento precisa saber **onde** cada pessoa trabalha (unidade e setor). Os dados têm que sair **padronizados**: quando o próprio usuário digita, sai "maria da silva" no certificado, matrícula "12.345-6", setor "TI" de um jeito, "IT" de outro, "Tecnologia da Informação" de outro. Por isso o RH passa a nomenclatura padrão e os dados entram por carga.

## Objetivos

1. O participante tem **nome completo** (obrigatório), **senha** (obrigatória) e, opcionais, **matrícula, e-mail, telefone, unidade e setor**.
2. **Cada empresa escolhe** quais opcionais são obrigatórios nela.
3. **Unidade e setor são listas fechadas** da empresa, cadastradas a partir do que o RH passa. Ninguém digita unidade ou setor no cadastro de uma pessoa: escolhe da lista.
4. A **carga por planilha** traz todos esses campos, padroniza o que dá para padronizar e recusa, com a linha e o motivo, o que está fora do padrão.
5. O **nome sai bem escrito** no certificado.
6. **O cadastro começa simples:** só nome e senha (e o login). Unidade e setor são atribuídos **depois**, por carga ou à mão, um a um ou em lote. Cada empresa configura os seus setores a partir do que o RH dela informa, junto com quais pessoas estão em cada setor.

## Fora deste projeto

- Relatórios e público por unidade e setor: projeto 3.
- O participante editar os próprios dados. *Decisão minha: só o administrador e o operador editam, porque a razão de existir a carga é evitar a digitação do usuário.* Ele só troca a senha.
- Hierarquia setor dentro de unidade. *Decisão minha: duas listas soltas.* Uma pessoa tem uma unidade e um setor, e o mesmo setor ("Produção") existe em várias unidades. Se precisar de "Produção de Minas" diferente de "Produção do ES", isso é o cruzamento unidade × setor no relatório.
- Integração com sistemas de RH (API, SFTP). A carga é por planilha.

## O que não pode acontecer

- Quebrar o login dos participantes que já existem. Hoje o login é o `EmployeeIdentifier`, a matrícula ou outro código.
- Uma carga mal feita estragar dados bons. A carga mostra uma prévia e só grava quando o administrador confirma.
- Perder o histórico do certificado: o nome que já foi para um certificado emitido não muda sozinho.

## Abordagens consideradas

- **A. Campos fixos no participante + listas da empresa.** ← **Escolhida (decisão minha).** Colunas `RegistrationNumber`, `Email`, `Phone`, `UnitId`, `SectorId` no usuário; tabelas `CompanyUnits` e `CompanySectors` por empresa; configuração de obrigatoriedade por empresa. É simples de consultar e filtrar no projeto 3 e cobre tudo o que foi pedido.
- B. Campos personalizados livres (a empresa cria "Turno", "Cargo"...). Descartada por enquanto: ninguém pediu e complica relatório e carga. Dá para somar depois sem desfazer o A.
- C. Unidade e setor como texto livre normalizado. Descartada: é exatamente o problema que o RH quer evitar.

## O design

### 1. Dados
- Usuário (`PlatformIdentityUser`) ganha `RegistrationNumber?`, `Phone?`, `UnitId?`, `SectorId?`. O e-mail usa o campo `Email` que o Identity já tem.
- `CompanyUnits(Id, TenantId, Name, IsActive)` e `CompanySectors(Id, TenantId, Name, IsActive)`. O nome é único por empresa, comparado sem acento e sem diferença de maiúsculas.
- `CompanyProfileRules(TenantId, RequireRegistration, RequireEmail, RequirePhone, RequireUnit, RequireSector)`. Tudo `false` por padrão.
- Desativar uma unidade ou setor só tira da lista de escolha. Quem já está nela continua. Não existe apagar se houver gente vinculada.

### 2. Login
- Hoje o login é o `EmployeeIdentifier`. **Ele continua sendo o login** e não muda para quem já existe.
- Na carga, se a pessoa tem matrícula, o login é a matrícula. Se não tem, o sistema **gera um login** curto e único (ex.: `maria.silva`, `maria.silva2`) e o entrega no CSV de acessos que a carga já produz hoje. *Decisão minha. Ver "Perguntas suas".*
- E-mail **não** é login. *Decisão minha: muito operário não tem e-mail, e a plataforma precisa funcionar igual para todos.*

### 3. Padronização (no back, na carga e no cadastro individual)
- **Nome:** espaços aparados e repetidos removidos; cada palavra com a primeira letra maiúscula e o resto minúsculo; "da", "de", "do", "das", "dos" e "e" em minúsculo no meio do nome. "MARIA DAS GRAÇAS DE SOUZA" → "Maria das Graças de Souza". O administrador pode corrigir à mão depois, e a correção manual não é reescrita.
- **Matrícula:** só letras e dígitos, sem pontos, traços ou espaços, em maiúsculas. "12.345-6" → "123456".
- **Telefone:** só dígitos. Exibido no formato brasileiro.
- **E-mail:** aparado e em minúsculas, com validação de formato.
- **Unidade e setor:** procurados na lista da empresa sem acento e sem diferença de maiúsculas ("tecnologia da informacao" acha "Tecnologia da Informação"). Se não acha, a linha é **recusada**. Não se cria um item novo pela carga.

### 4. Telas
- **Empresa › Cadastro** (nova aba, para o operador e o administrador): as duas listas (adicionar, renomear, desativar, colar várias linhas de uma vez) e as caixas "obrigatório" de cada campo opcional.
- **Participantes:** colunas e filtros de unidade e setor; o diálogo de editar participante ganha os campos novos, com unidade e setor em lista suspensa.
- **Mudar setor em lote:** em Participantes, marcar várias pessoas (ou "todas do filtro") → **"Mudar setor"** / **"Mudar unidade"** → escolher da lista. Filtro **"Sem setor"** para achar quem ainda falta.
- **Carga** (o diálogo atual de importar CSV):
  - Aceita também **.xlsx**, porque o RH trabalha em Excel. *Decisão minha.*
  - Botão **"Baixar modelo"**, com as colunas e uma aba com as listas válidas de unidade e setor.
  - Colunas reconhecidas: nome, matrícula/login, e-mail, telefone, unidade, setor.
  - **Prévia antes de gravar:** quantos serão criados, quantos atualizados, quantos recusados (cada um com linha e motivo).
  - **Atualiza quem já existe:** a pessoa é reconhecida pela matrícula/login. Uma célula vazia não apaga um dado existente.
  - **Carga parcial:** uma planilha só com as colunas login e setor atualiza só o setor. É o jeito de o RH dizer quem está em cada setor depois que as pessoas já foram cadastradas.
  - Hoje o front cria um participante por chamada. A carga passa a ser **uma chamada só, processada no back**, com prévia (`dryRun`) e gravação. Isso dá padronização única, transação e velocidade para 600 ou mais linhas.
- **Certificado:** usa o nome padronizado.

### 5. Obrigatoriedade
- Vale no cadastro individual e na carga: falta um campo obrigatório, a linha é recusada.
- Ligar a obrigatoriedade numa empresa que já tem gente sem o campo **não bloqueia ninguém**. Só mostra, em Participantes, "N pessoas sem setor", com filtro.

## Testes
- Padronização de nome (maiúsculas, partículas, espaços, acentos), matrícula, telefone e e-mail.
- Carga: cria, atualiza, recusa unidade fora da lista, recusa obrigatório faltando, célula vazia não apaga, prévia não grava, login gerado sem colisão.
- Login de quem já existia continua funcionando.

## Perguntas suas (o design segue com a minha decisão até você responder)
1. **Sem matrícula, qual é o login?** Proponho login gerado (`maria.silva`). As alternativas são CPF ou telefone.

**Respondido em 2026-11-21:** cada empresa configura os próprios setores, conforme o RH dela informa. O administrador da empresa cadastra as listas, e o operador também pode cadastrar ao montar a empresa.
