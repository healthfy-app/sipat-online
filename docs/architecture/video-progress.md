# Arquitetura de trilhas, vídeo e progresso

## Status e escopo

Esta decisão define a arquitetura para conteúdo em vídeo e progresso no SIPAT Online. A primeira fatia vertical foi implementada seguindo os limites descritos abaixo; fornecedor de vídeo de produção ainda não foi escolhido.

### Estado da primeira fatia

- `Learning.Domain` e `Learning.Application` implementam trilhas, revisões, itens, atribuições individuais e progresso por participante/item, sem depender de EF Core ou do provedor de vídeo.
- A infraestrutura atual persiste em tabelas próprias no schema `learning`. A referência opaca do provedor e a duração estão no item da revisão; não há catálogo compartilhado `VideoAsset` nesta fatia.
- As faixas aceitas são armazenadas como JSON no progresso. O contrato de aplicação permite trocar a persistência sem alterar o domínio.
- A administração já permite criar trilhas vinculadas à programação da SIPAT, adicionar vídeos a rascunhos retomáveis, publicá-las e atribuir trilhas publicadas individualmente.
- Em `Development`, o perfil de participante separado recebe três trilhas com vídeos de referência em domínio público do NIOSH/CDC e uma trilha técnica isolada com o vídeo CC0 de flores da MDN para validar reprodução MP4 e salvamento de progresso. Nenhum desses vídeos representa o catálogo proprietário da SIPAT Online. A verificação continua local/em memória e não deve ser usada como participação oficial. Fora de `Development`, sem provider configurado, playback retorna indisponibilidade explícita.

O escopo implementado é trilhas versionadas, vídeos assistidos em qualquer ordem e progresso por participante/item, com autoria/publicação e atribuição individual. Grupos/subgrupos, comentários, certificados, relatórios, ranking e regras oficiais de carga horária seguem pendentes, embora sejam requisitos de produto confirmados pelo PO.

## Onboarding multiempresa

- Empresa/tenant é dado operacional cadastrado após a contratação do SIPAT Online; nenhum cliente (COMIG ou outro) é privilegiado em código ou seed de produção.
- O host central (`Tenant:PlatformHost`) usa uma identidade `PlatformOperator` sem `TenantId`; ela provisiona empresas, consulta um diretório global paginado de usuários e cadastra usuários em empresas ativas com os perfis `Participant` e `ClientAdmin`. A criação de contas é auditada; edição global de contas e relatórios ainda não estão implementados. O papel legado `SuperAdmin` continua tenant-bound. Funcionalidades globais são habilitadas somente à identidade global, sem transformar papéis de cliente em bypass entre tenants.
- O provisionamento cria o tenant, o primeiro `ClientAdmin` e a trilha de auditoria em uma transação. As chaves únicas determinam os subdomínios dos clientes.
- O Admin do cliente pode criar contas de participantes e atribuir trilhas publicadas pertencentes ao tenant; a API continua verificando o tenant, o papel de participante e a publicação antes de aceitar a atribuição.
- A configuração estática `TenantRuntimeOptions` continua como bootstrap de desenvolvimento, não como lista de clientes em produção.
- O modelo de pacote comercial/entitlements ainda precisa ser ligado ao catálogo reutilizável de trilhas. Até isso existir, a interface de atribuição lista trilhas publicadas do tenant; ela não deve ser interpretada como validação do pacote vendido.
- Domínios personalizados ainda não são ativados: falta verificar controle do domínio e provisionar DNS/TLS. O campo de branding existente não concede roteamento para um host arbitrário.

## Decisões de produto

| Tema | Decisão |
| --- | --- |
| Conceito raiz | SIPAT é o evento legal de prevenção organizado como uma semana de atividades pela empresa; SIPAT Online oferece o conteúdo digital das palestras em EAD e a plataforma que viabiliza a realização do evento. |
| Acesso | O participante consulta somente as trilhas que lhe foram atribuídas. |
| Atribuição MVP | Individual por participante; atribuição por grupo/subgrupo é uma evolução futura. |
| Ordem | Vídeos podem ser assistidos em qualquer ordem. |
| Identidade do progresso | Participante + item de vídeo da trilha. O mesmo vídeo em outra trilha possui progresso separado. |
| Conclusão | Pelo menos 90% da duração com cobertura de reprodução verificada. Seek isolado, replay de trechos e valor de progresso enviado pelo browser não concluem o vídeo. |
| Vídeo | Provedor gerenciado, encapsulado por adapter; fornecedor concreto será selecionado em PoC. |
| Identidade | Reutilizar o ID do usuário autenticado existente; Learning não cria uma identidade paralela. |
| Alteração publicada | Publicar mudanças como uma nova revisão imutável; manter revisões antigas e seus progressos. |
| Correção administrativa | Admin pode inspecionar/reproduzir para gestão, mas não alterar manualmente o progresso do participante. |
| Integração existente | Novo módulo e contratos aditivos; preservar APIs, regras e dados dos módulos existentes. |

## Requisitos do PO e estado

| Perfil/capacidade | Escopo confirmado | Estado |
| --- | --- | --- |
| Super Admin SIPAT Online | Gestão global de usuários e relatórios individuais/agregados por SIPAT, grupo e subgrupo, sem restrições funcionais entre clientes | Parcial: `PlatformOperator` provisiona empresas, consulta diretório global e cadastra usuários em empresas ativas; edição de contas e relatórios pendentes; `SuperAdmin` legado permanece tenant-bound |
| Admin do cliente | Relatórios das SIPATs sob sua responsabilidade, avanço/retrocesso para acompanhamento e moderação de comentários | Pendente; acesso atual limita-se ao tenant e à gestão básica de participantes/conteúdo |
| Participante | Relatório próprio, retrocesso sem avanço não assistido, comentários e certificado | Parcial: player/progresso existem; relatório formal, comentários e certificados pendentes |
| Ranking | Pontuação e classificação por SIPAT | Requisito confirmado; regras de pontos/desempate precisam de decisão do PO |

O acesso "sem restrições" do Super Admin significa acesso funcional global, não ausência de autenticação ou auditoria. Consultas e ações entre tenants devem ser explícitas, autorizadas e rastreáveis. O Admin do cliente permanece isolado no tenant e deve receber escopo explícito de SIPAT; a participação/acesso administrativo não deve ser inferida apenas pelo papel global `ClientAdmin`.

## Limites de contexto e dependências

Adicionar o bounded context `Learning` ao monólito modular atual:

```text
SipatOnline.Learning.Domain
        ↑
SipatOnline.Learning.Application
        ↑                         ↑
SipatOnline.Infrastructure       SipatOnline.Api
        ↑                         ↑
       composição e endpoints novos
```

As setas representam dependência de código apontando para dentro: Domain não conhece Application, Infrastructure, API, EF Core ou SDK de fornecedor; Application depende do domínio e define portas; Infrastructure implementa persistência e integração externa; API adapta HTTP aos casos de uso.

- `Learning` referencia SIPAT, tenant e participante por identificadores estáveis. Não importa entidades ou agregados de `Sipats`, `Tenancy` ou `Identity`.
- `SipatEvent` mantém seus limites atuais. A ligação entre uma trilha e uma SIPAT é um identificador; Learning controla o próprio conteúdo e progresso.
- A identidade autenticada do participante é resolvida no limite de aplicação/API para um identificador opaco estável. O cliente nunca escolhe o participante cujo progresso está lendo ou alterando.
- A infraestrutura atual pode hospedar as configurações EF e adapters de Learning no assembly existente, mantendo pastas, tabelas, serviços e migrações próprios do módulo.
- O PostgreSQL/EF Core já adotado pode persistir a primeira versão. A porta de repositório evita dependência do domínio/application no mecanismo de persistência; não é necessário abstrair ou reescrever módulos antigos.
- `BuildingBlocks` deve continuar restrito a conceitos realmente transversais. Tipos próprios de trilha, mídia e progresso pertencem a Learning.

## Próximas entregas em ordem

1. Definir o modelo de participação por SIPAT, associação de grupos/subgrupos e escopo das SIPATs que cada Admin do cliente pode consultar.
2. Alinhar `PlatformOperator` ao Super Admin global esperado, cobrir gestão de usuários e relatórios globais com autorização/auditoria e preservar o papel legado tenant-bound durante a migração.
3. Decidir os critérios de carga horária/certificação e a pontuação, desempate e visibilidade do ranking com o PO.
4. Selecionar e integrar provedor por prova de conceito; carregar apenas palestras e vídeos autorizados e substituir os assets de demonstração.
5. Implementar relatórios, comentários/moderação, certificados e ranking associados à SIPAT e à participação comprovada.
6. Vincular pacotes comerciais/grades contratadas ao catálogo de conteúdos e limitar a atribuição ao que a empresa contratou.
7. Fechar operação de produção: backups restauráveis, monitoramento, proteção dos vídeos e DNS/TLS de domínios próprios.

## Modelo de domínio

### `VideoAsset`

Raiz de agregado para metadados de uma mídia controlada pelo tenant: identificador, duração conhecida e referência opaca ao recurso do provedor. Não armazena URL pública duradoura, token de reprodução, segredo ou tipo concreto de SDK. O adapter resolve uma sessão de reprodução temporária em tempo de execução.

Uma mídia pode ser reutilizada em itens de trilhas do mesmo tenant. O caso de uso valida a coerência entre tenant, SIPAT, trilha e asset antes de associá-los.

### `LearningTrack`

Raiz de agregado associada a `TenantId` e `SipatEventId`, com identidade estável e metadados. Contém revisões ordenadas, mas não incorpora participantes, estado de player ou progresso.

`TrackRevision` é uma revisão imutável publicada de uma trilha. Mudanças em conteúdo publicado criam uma nova revisão; não alteram a revisão histórica. Uma revisão contém itens ordenados e prontos para reprodução.

`TrackItem` pertence a uma revisão e é identificado por ID próprio, com referência a `VideoAssetId` e posição de exibição. Reordenar um item durante a edição mantém sua identidade dentro da revisão em preparo. Substituir a mídia ou publicar uma revisão nova produz novos IDs de item; IDs antigos nunca são reutilizados. Assim, a cobertura anterior permanece ligada à revisão e mídia que a originaram.

Uma trilha só pode ser disponibilizada para participantes quando há revisão atual publicada, com itens válidos associados a assets prontos para reprodução. A atribuição aponta para `LearningTrack`, não para uma revisão fixa; o participante recebe a revisão publicada atual. Revisões antigas e seus progressos ficam disponíveis para histórico e auditoria, mas não recebem novas sessões de reprodução.

### `TrackAssignment`

Raiz de agregado que associa uma trilha a um usuário existente dentro de um tenant/SIPAT. O `ParticipantId` no domínio é um identificador opaco mapeado ao ID estável do usuário autenticado, sem referência a tipos de `Identity`. Impõe unicidade da atribuição ativa para participante e trilha. A consulta de conteúdo verifica a atribuição no servidor, além do tenant e SIPAT, e resolve a revisão atual publicada.

O modelo permite acrescentar atribuições por grupo no futuro sem introduzir grupos nesta fatia. A resolução futura de grupos deve gerar uma visão efetiva de acesso sem transferir a autoridade de autorização ao frontend.

### `VideoProgress`

Raiz de agregado com chave lógica `(ParticipantId, TrackItemId)`, em que o item pertence a uma revisão específica. Armazena cobertura assistida como intervalos de tempo normalizados (milissegundos inteiros) e referências às sessões/evidências aceitas. A porcentagem é derivada da união dos intervalos em relação à duração verificada do asset; não é um contador cumulativo de eventos nem um campo livre fornecido pelo cliente.

Invariantes:

1. A duração é positiva e associada ao asset usado pelo item.
2. Intervalos devem estar dentro da duração e vinculados a uma sessão autorizada daquele participante e item.
3. Intervalos sobrepostos ou eventos repetidos não aumentam a cobertura já contada.
4. Saltos/seek sem evidência de reprodução não criam cobertura.
5. Conclusão é derivada quando a cobertura única atinge 90%; o estado não é definido por um comando `Complete` do cliente.
6. Cada progresso pertence a um item de uma revisão. A mesma mídia em outra trilha ou revisão não herda essa cobertura.
7. Uma reprodução iniciada por Admin para gestão não escreve no progresso do participante.
8. Revisões antigas e seu progresso são históricos e não são transferidos para a revisão atualmente publicada.

O identificador do participante mapeia para o ID do usuário autenticado já existente sem acoplar o domínio Learning ao modelo de usuário do Identity. O cadastro/matrícula corporativa continua responsabilidade dos fluxos existentes ou de uma fatia própria, não de uma identidade duplicada em Learning.

## Casos de uso e portas

### Casos de uso de administração

- Criar/editar trilha e seus itens.
- Publicar trilha.
- Criar uma nova revisão para alterações de conteúdo já publicado.
- Criar/atualizar asset e confirmar que a mídia está pronta.
- Atribuir trilha a um participante e consultar/remover atribuições.

Todos recebem o tenant e ator do contexto autenticado; as consultas e comandos verificam que SIPAT, trilha, asset e participante pertencem ao tenant permitido. Escritas seguem autenticação, autorização, antiforgery e auditoria usados pela API atual. Admin não recebe caso de uso para corrigir o progresso manualmente.

### Casos de uso do participante

- Listar SIPATs/trilhas disponíveis conforme atribuição.
- Obter a trilha e o progresso dos seus itens.
- Iniciar reprodução de item autorizado.
- Receber/registrar evidência normalizada de reprodução.

O participante é sempre inferido da sessão autenticada. O API não aceita `participantId` como autoridade de leitura/escrita do progresso.

### Portas de Application

- Repositórios de `LearningTrack`, `VideoAsset`, `TrackAssignment` e `VideoProgress`, com consultas explicitamente limitadas por tenant/escopo.
- `IVideoPlaybackProvider`: prepara sessão temporária para asset, sessão de reprodução e origem autorizada; não expõe o SDK do fornecedor.
- `IVideoPlaybackEvidenceVerifier` (ou operação equivalente no adapter): valida autenticidade e converte eventos do fornecedor para evidência neutra contendo identificador de sessão, item, intervalos reproduzidos, duração, sequência e instante.
- `IApplicationUnitOfWork` existente para atomicidade de dados do caso de uso e auditoria quando necessário.

Não retornar URL permanente nem credencial do fornecedor. O segredo de assinatura/webhook fica em configuração segura, nunca em Domain, API response ou banco de progresso.

## Adapter e verificação do provedor

O contrato do adapter deve permitir substituir o fornecedor sem alterar regras do domínio, DTOs públicos ou as features existentes. O SDK, modelos, códigos de erro e callbacks proprietários ficam exclusivamente no adapter de Infrastructure.

Uma sessão de reprodução temporária é emitida somente após validar identidade, tenant, atribuição, publicação da trilha e disponibilidade do item. A evidência aceita deve ser autenticada por assinatura de webhook ou consulta servidor-a-servidor ao provedor e vinculada à sessão criada. A validação verifica destinatário, asset/item, expiração, sequência e replay; processamento repetido é idempotente.

O provedor mínimo precisa fornecer:

- reprodução incorporada e acesso protegido, sem URL permanente pública;
- duração confiável da mídia;
- identificação de sessão e evidência autenticável de trechos efetivamente reproduzidos;
- eventos ou consultas que permitam deduplicar, ordenar e reconciliar evidências;
- suporte a legendas e requisitos de privacidade, além de custos e portabilidade aceitáveis.

Se a PoC revelar somente eventos manipuláveis do player cliente, o requisito de progresso verificado não está satisfeito. Nesse caso, revisar a garantia de conclusão com o negócio antes de escolher o provedor; não degradar silenciosamente para percentual enviado pelo browser.

## Persistência e consistência

Persistir em tabelas próprias. A primeira implementação usa `learning.LearningTracks`, `LearningTrackRevisions`, `LearningLessons`, `LearningAssignments` e `LearningProgress`; o progresso mantém as faixas em JSON. Um catálogo de mídia, intervalos normalizados em tabela ou sessões persistidas só devem ser introduzidos quando um requisito do provedor escolhido justificar a mudança.

- Aplicar chaves estrangeiras e unicidade para IDs e combinações lógicas; validar tenant/SIPAT em operações de aplicação mesmo que existam constraints relacionais.
- Manter duration, offsets e timestamps em representações sem ambiguidade de unidade/fuso.
- Processar evidência e atualizar a união de intervalos de forma transacional e idempotente.
- Rejeitar eventos inválidos com resposta/log explícitos e sem criar progresso parcial.
- Criar migrações apenas aditivas. Não renomear, remover ou mudar constraints das tabelas Identity, Tenancy, Sipats ou auditoria nesta entrega.
- Armazenar apenas referências do provedor e material mínimo de sessão; segredos são fornecidos por configuração segura.

## API e autorização

Os endpoints são novos e separados por capacidade. Os nomes finais devem seguir convenções atuais:

- Administração: operações de trilha, item, mídia e atribuição sob o escopo do tenant/SIPAT.
- Participante: listagem de trilhas atribuídas, leitura do próprio progresso e solicitação de sessão temporária de reprodução.
- Integração de provedor: endpoint dedicado para callbacks autenticados, sem cookie de participante; validação de assinatura ocorre antes de aceitar dados.

Cada operação verifica no servidor:

1. ator autenticado e papel/permissão apropriados;
2. tenant resolvido pela pipeline atual;
3. SIPAT, trilha e asset pertencentes ao tenant correto;
4. estado publicado e atribuição ativa para acesso do participante;
5. propriedade de sessão e item para cada evidência/progresso.

Respostas não revelam se recursos de outros tenants existem. Writes autenticados por cookie mantêm antiforgery. O escopo Admin não concede capacidade de alterar progresso do participante implicitamente; qualquer ajuste administrativo futuro será um caso de uso distinto, auditado e aprovado pelo negócio.

## Compatibilidade e evolução

- Adicionar assemblies, configurações de DI, endpoints e migration de Learning sem substituir os registros atuais de serviços.
- Não modificar contratos, políticas, tabelas ou regras de Identity, Tenancy ou administração de SIPATs.
- O `SipatEvent` atual segue independente; uma trilha armazena apenas seu ID de referência.
- Falhas ou ausência do provedor não devem impedir inicialização da API nem alterar funcionalidades existentes; operações que exigem vídeo retornam erro explícito e observável.
- Fornecedor e player podem ser substituídos implementando os mesmos ports. A troca não muda os IDs de trilha/item nem os dados neutros de progresso.
- Atribuição por grupos poderá ser adicionada como origem de autorização, preservando a atribuição individual e o progresso já registrado.

## Plano de testes e critérios de aceite arquitetural

### Domain

- criação e publicação de trilhas e itens válidos;
- unicidade/identidade do item e substituição de mídia sem reaproveitar progresso;
- união de intervalos adjacentes, sobrepostos e repetidos;
- cobertura mínima e fronteira exata de 90%;
- rejeição de intervalos fora da duração e de evidência sem sessão/item correspondente.

### Application

- acesso somente por atribuição ativa e tenant correto;
- seleção do participante exclusivamente pelo contexto autenticado;
- idempotência e processamento fora de ordem;
- adapter indisponível ou evidência inválida não gera conclusão nem estado de sucesso.

### Architecture / integration

- Domain não referencia Application, Infrastructure, API, EF ou SDKs;
- Application não referencia Infrastructure, API ou SDKs de fornecedor;
- somente o adapter referencia o SDK escolhido;
- migration cria apenas artefatos Learning;
- testes de integração cobrem tenant isolation, autorização, assinatura inválida, repetição de callback e persistência transacional;
- a suíte existente de Identity, Tenancy e Sipats continua passando sem alteração de resultados.

## Próximos passos

1. PoC e seleção do fornecedor com base nos critérios acima; manter playback indisponível em produção até que evidência server-to-server seja validada.
2. Criar uma interface administrativa para autoria de trilhas e atribuições.
3. Confirmar regras de matrícula/inscrição corporativa e elegibilidade de usuários para uma SIPAT, sem criar identidade paralela.
