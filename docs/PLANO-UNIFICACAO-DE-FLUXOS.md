# Plano de unificação dos fluxos do SIPAT Online

Objetivo: um único caminho lógico, do catálogo até o participante, sem telas ou conceitos que se cruzem.
Este plano parte do que foi definido na conversa e do que o código tem hoje.

## 1. O modelo de negócio (o que fica de pé)

- **SIPAT = uma semana de treinamento de uma empresa, em um ano** (2024, 2025, 2026...).
- **Como se cria (único caminho):** data de início → quantos dias → associar um **tema** a cada dia → publicar.
- **Dia = um tema.** Um tema reúne os vídeos (até 10) e os jogos/quiz do dia. O dia tem ainda slogan e data.
- **Regras**
  1. Uma SIPAT **publicada por vez** por empresa. As anteriores ficam no histórico e seus certificados continuam disponíveis.
  2. Toda SIPAT começa em **rascunho**; só ao **publicar** os dias chegam aos participantes.
  3. **Depois de publicada** pode-se mudar o tema de um dia; dias que alguém já começou ficam como estão.
  4. **Duplicar** de outra SIPAT (outro ano) cria um rascunho com os mesmos temas e datas em aberto. Isso substitui as "SIPATs prontas".
  5. **Quem monta:** o operador e o administrador da empresa, **na mesma tela**.
- **Acervo (global, do operador):** vídeos, temas e jogos. Edição fora de qualquer empresa. O que a empresa recebe é uma cópia (fotografia) do tema.
- **Planos comerciais (Bronze, Prata, Diamante):** personalização só a partir do Prata; jogos, quiz e formulários só no Diamante. **Ainda não existe no sistema** (ver fase 7).

## 2. Quem usa e o que vê

| Perfil | Vê e faz |
|---|---|
| **Operador** | Acervo (vídeos, temas, jogos). Empresas. Dentro de uma empresa: SIPATs, participantes, administradores, identidade. |
| **Administrador da empresa** | As SIPATs da empresa (monta, duplica, publica), participantes e acompanhamento, identidade visual, certificados. |
| **Participante** | A SIPAT vigente (caminho dos dias e vídeos da semana), histórico por ano e certificados por ano. |

## 3. Mapa dos fluxos: o que fica, o que une, o que sai

| Hoje | Destino |
|---|---|
| Ops › Construção SIPAT solta (`/platform/sipat-builder`) | **Sai.** Vira "SIPATs" dentro da empresa. |
| Ops › Biblioteca › aba "SIPATs prontas" (programas globais) | **Sai.** Substituída por "Duplicar de outra SIPAT". |
| Ops › "Aplicar a uma empresa" (`ApplyDialog`) | **Sai.** Publicar a SIPAT já entrega os dias. |
| Ops › Empresa › "Construção SIPAT" (lista de programas) | **Muda** para a lista de SIPATs da empresa, por ano. |
| Painel do cliente › Programação (`/admin/sipats`, eventos) | **Une** com a Construção: vira a lista de SIPATs e o construtor. |
| Painel do cliente › Trilhas e vídeos (`/admin/content`) | **Sai.** O cliente não cria trilha; escolhe temas. |
| Painel do cliente › Participantes e trilhas | **Fica**, falando em dias/vídeos. |
| Painel do cliente › Identidade visual | **Fica.** |
| Participante › Meus cursos (lista com busca e categorias) | **Muda** para a semana: caminho dos dias + vídeos por dia. |
| Participante › Certificados | **Fica**, agrupados por ano. |

## 4. Modelo de dados e API (alvo)

- **SIPAT** continua sendo `SipatEvent` (empresa, título, datas, estado: Rascunho / Publicada / Cancelada).
- **Plano da SIPAT** (novo): `SipatPlans`, uma linha por SIPAT com os dias (título, data, assunto, vídeos, jogos).
- **Entrega:** cada dia publicado vira uma trilha (`LearningTrack`) com dia, posição e data; participantes ativos são atribuídos.
- **Endpoints sob `/api/admin`** (o operador usa os mesmos, dentro da empresa, pelo cabeçalho de contexto):
  - `GET /sipat-catalog` e `/sipat-catalog/courses/{id}/cover` (somente leitura);
  - `GET /sipat-plans`; `GET/PUT /sipats/{id}/plan`; `POST /sipats/{id}/plan/copy-from/{origem}`; `POST /sipats/{id}/plan/launch`.
- **A remover do backend** quando as telas antigas saírem: programas globais (`/api/platform/catalog/programs`, `SipatPrograms`) e `ApplyProgram` por empresa.

## 5. Fases

| # | Fase | Estado |
|---|---|---|
| 1 | **Backend da SIPAT única:** plano de dias por SIPAT, publicar com "uma por vez", duplicar, catálogo para o administrador. | **Feito** (commit local, teste de integração passando) |
| 2 | **Telas compartilhadas:** lista de SIPATs por ano e construtor (data de início, dias, temas, rascunho, duplicar, publicar), iguais para operador e administrador. | **Em andamento** (lista escrita; construtor e rotas pendentes) |
| 3 | **Ops:** entrar na empresa → SIPATs; remover Construção solta, "SIPATs prontas" e "Aplicar a uma empresa". | Pendente |
| 4 | **Painel do cliente:** "SIPATs" no lugar de Programação e de Trilhas e vídeos; participantes e identidade ficam. | Pendente |
| 5 | **Participante:** semana vigente e histórico por ano; certificados por ano; contadores em dias. (A semana com caminho e vídeos por dia já existe.) | Parcial |
| 6 | **Limpeza:** remover código e endpoints antigos; migrar SIPATs e programas já salvos; atualizar testes e a demo (cada empresa com uma SIPAT publicada por ano). | Pendente |
| 7 | **Planos Bronze / Prata / Diamante:** plano por empresa, que limita quem pode personalizar e quem pode ter jogos e formulários. | Pendente, depende de decisão |

## 6. Riscos e decisões em aberto

- **Dados já existentes:** SIPATs publicadas e programas salvos no formato antigo precisam de migração ou de descarte consciente (a demo é recriada).
- **Edição depois de publicada:** só troca de tema em dias sem progresso; mudar datas e quantidade de dias de uma SIPAT já publicada precisa de regra clara.
- **Vídeo em produção:** sem o provedor de vídeo configurado ninguém assiste; é pré-requisito do go-live de novembro, fora deste plano.
- **Importação em massa dos 600 participantes:** não existe; também pré-requisito do go-live.
- **Planos comerciais (fase 7):** definir se o plano é uma configuração do operador por empresa e o que bloqueia exatamente em cada plano.
- **Identidade visual do app:** guia de identidade ainda por definir; as telas novas seguem o padrão atual até lá.

## 7. Critério de pronto

Do operador ao participante existe **um** caminho: acervo → SIPAT da empresa (início, dias, temas, publicar) → semana do participante → certificado do ano. Nenhuma tela cria conteúdo fora desse caminho, e nenhum conceito (programa, trilha, curso, aula) aparece com dois nomes.
