# Pesquisa de UX para vídeo e aprendizagem

Pesquisa consultada em 2 de novembro de 2026. A comparação orienta padrões de experiência; não implica copiar marcas, layouts ou ativos.

## Referências consultadas

| Referência | Observações úteis | Limites da pesquisa |
| --- | --- | --- |
| [Coursera](https://www.coursera.org/) | Apresenta planos de aprendizagem com contexto, autoria e duração; reforça uma hierarquia que explica o que a pessoa vai aprender antes de consumir o conteúdo. | Inspecionada a página pública inicial, não uma sessão autenticada de aluno. |
| [MasterClass](https://www.masterclass.com/) | Referência visual solicitada para conteúdo editorial e foco no vídeo. | A página bloqueou a leitura automatizada (HTTP 403); nenhuma conclusão específica de interface foi presumida. |
| [Udemy](https://www.udemy.com/) | Referência solicitada para navegação de aulas e estrutura de aprendizagem. | A página bloqueou a leitura automatizada (HTTP 403); nenhum comportamento privado do player foi presumido. |
| [Netflix](https://www.netflix.com/) | A página pública descreve continuidade de reprodução em vários dispositivos; inspira preservar contexto e retomada sem transformar treinamento em entretenimento. | Inspecionada apenas a página pública, não a reprodução autenticada. |
| [Vimeo Player](https://vimeo.com/features/video-player) | A página do fornecedor descreve player incorporado, legendas, personalização e controles de privacidade. São critérios para uma futura PoC, não capacidades já disponíveis no SIPAT Online. | Conteúdo comercial do próprio fornecedor; alegações devem ser validadas na PoC. |
| [HTML `<video>` — MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video) | Controles nativos, legendas via `<track>`, fallback e propriedades de mídia permitem começar sem uma dependência de player e sem fingir integração com um fornecedor. | Comportamento e disponibilidade de controles variam entre navegadores; reprodução protegida continua dependendo do provedor. |
| [Mux Player API para React](https://www.mux.com/docs/guides/player-api-reference/react) | API especializada expõe estado/eventos e integra player a um serviço gerenciado; evidencia o custo de acoplar o produto a um fornecedor antes de uma PoC. | Não adotado: não há conta, asset nem decisão de fornecedor no projeto. |
| [Eventos de playback Mux](https://www.mux.com/docs/guides/mux-data-playback-events) | Diferencia `play`, `playing`, `pause`, `timeupdate`, `seeking` e `seeked`; confirma que telemetria de player é útil para UX/observabilidade, mas não equivale a prova independente de conclusão. | Analytics de playback não substitui verificação servidor-a-servidor nem assinatura confiável. |
| [Video.js React — acessibilidade](https://videojs.org/docs/framework/react/guides/accessibility) | Exemplos tratam controles nomeados, teclado, foco, mensagens de status e legendas como partes do player, não acabamento opcional. | Não adotado; a infraestrutura disponível não requer um player framework nesta etapa. |
| [Video.js React — teclado](https://videojs.org/docs/framework/react/guides/keyboard-shortcuts) | Atalhos precisam ser descobríveis, operáveis por teclado e anunciados; gestos de toque devem complementar, nunca substituir controles. | Não adotado como dependência. |
| [shadcn/ui](https://ui.shadcn.com/docs) | É distribuição de código composável, não uma dependência pronta. Seu ecossistema pressupõe seleção/adaptação de componentes. | Tailwind, Radix e shadcn/ui não estão instalados; introduzi-los só para esta tela aumentaria a superfície técnica sem necessidade. |
| [Motion para React — acessibilidade](https://motion.dev/docs/react-accessibility) | Respeitar `prefers-reduced-motion`, evitar animações de grande deslocamento e não animar automaticamente a mídia. | Não adotado: transições CSS discretas bastam para o escopo. |

## Padrões selecionados

- Deixar claro que a pessoa está acessando uma **trilha de uma SIPAT**, com título, contexto e progresso antes ou ao lado do vídeo.
- Manter vídeo como área principal e currículo como navegação secundária, sem widgets ou cartões decorativos que concorram por atenção.
- Exibir itens em ordem livre, estado textual (não apenas cor), duração e um indicador de progresso cuja origem seja a API.
- Persistir posição para retomada separadamente da cobertura verificada. Posição atual e seek do navegador jamais marcam conteúdo como assistido.
- Mostrar estados claros de carregamento, vazio, falha/repetição e indisponibilidade de provedor; nunca renderizar dados demonstrativos como se fossem conteúdo real.
- Usar HTML semântico e controles nativos enquanto o player/provedor não for escolhido. Quando um provedor for selecionado, revalidar controles, captions, teclado, fullscreen, velocidade e acessibilidade em navegadores reais.
- Em mobile, priorizar vídeo e navegação de trilha acessível sem overflow horizontal; preservar posição ao trocar item.
- Reservar `aria-live` para confirmações e erros, não para atualizações frequentes do playhead. Animar apenas progress feedback e respeitar `prefers-reduced-motion`.
- Preservar marca e cores fornecidas pelo tenant; não criar identidade visual paralela à SIPAT Online.

## Bibliotecas avaliadas

| Opção | Avaliação | Decisão |
| --- | --- | --- |
| HTML5 `<video>` | Já faz parte da plataforma web, oferece controls/captions e não aumenta dependências; adequado como superfície de renderização para uma URL de sessão autorizada. | Base do player adaptável. Só renderizar mídia quando a API devolver sessão/URL real. |
| Mux React Player | Player e APIs orientados a Mux; requer decisão/configuração de fornecedor e pode introduzir dependência no frontend. | Adiado até PoC. O SDK, caso escolhido, ficará encapsulado no adapter de player/integração, não no domínio. |
| Video.js React | Conjunto rico de controles e padrões de acessibilidade, mas uma dependência adicional sem stream/configuração atual. | Não adicionar antes de provar requisito que HTML nativo não atende. |
| shadcn/ui + Radix | Útil quando a aplicação adota o ecossistema Tailwind/componentes composáveis. O projeto usa CSS próprio e não possui Tailwind/Radix. | Não introduzir no MVP. Reutilizar tokens e convenções CSS existentes. |
| Motion | Animações React e suporte a movimento reduzido. | Não adicionar; transições CSS pequenas são suficientes. |

## Decisões de implementação

- A implementação mantém React 19, TypeScript estrito e CSS existente, sem upgrades nem novas dependências.
- O domínio do produto continua sendo SIPAT → trilhas → itens de vídeo. “Curso” e “módulo” não substituem a linguagem de SIPAT definida pelo projeto.
- O player recebe a mídia somente de uma sessão emitida pelo backend/adaptador. Sem provider configurado, apresentar indisponibilidade explícita; não usar URL de demonstração.
- A camada de UX pode persistir posição de retomada, mas progresso assistido e conclusão exigem evidência verificável processada no servidor.
- Respeitar teclado, foco visível, labels acessíveis, captions, contraste, alvos de toque e movimento reduzido. Cobertura WCAG requer auditoria automatizada e manual após a integração do provider.

## Pendência de integração

Nenhum provedor de vídeo está configurado no repositório. A experiência de reprodução real e a coleta de evidência ficam limitadas até selecionar um fornecedor e validar, em PoC, URLs/sessões protegidas, eventos ou consultas autenticáveis, captions, reprodução móvel, custos e portabilidade. Eventos analytics enviados pelo player (por exemplo, `timeupdate`) são telemetria do cliente e não demonstram por si só cobertura assistida confiável.
