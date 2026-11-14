# SIPAT Online — estado e pendências para o P.O.

Documento de apoio para a conversa de produto. Resume o que está pronto, como mostrar, o que o P.O. precisa decidir e o que ainda falta antes de abrir para os 600+ participantes do cliente.

> Nota de transparência: várias telas novas foram validadas por testes automáticos, mas nem todas foram percorridas num navegador por quem escreveu. Antes da demonstração, vale um passe visual (desktop e celular) pelos fluxos abaixo.

## 1. Onde estamos

**Pronto e coberto por teste**

- **SIPAT por dias:** uma SIPAT é uma semana de treinamento de uma empresa num ano. Início, N dias, um assunto por dia (data, slogan, até 5 vídeos, jogos), publicar. Só uma SIPAT publicada por vez; histórico por ano.
- **Ciclo de vida:** Rascunho, Criada, Publicada, Em andamento, Concluída; duplicar para um novo rascunho; **cancelar e reativar** (volta como rascunho).
- **Mesmas telas para operador e administrador da empresa.**
- **Planos Bronze, Prata, Ouro e Diamante** escolhidos pelo operador, com matriz de assuntos liberados por plano. A empresa não vê o nome do plano.
- **Biblioteca** (operador): assuntos, vídeos, jogos e perguntas, planos; **categorias** cadastráveis (Alimentação, Segurança no trabalho, Postura, Saúde mental) no lugar de "Opção 1/2/3"; busca e filtros que se mantêm ao trocar de aba.
- **Colaboradores:** administrador edita nome, matrícula, senha e acesso numa tela só.
- **Participante:** palco da semana (trilha dos dias, vídeos por dia, recolher/abrir dia), página do dia com player, cartão de dia concluído com o próximo dia, mensagens de incentivo por faixa de progresso.
- **Certificado por SIPAT**, ordenado do mais recente, com o período.
- **Quem entra depois da publicação recebe os dias** (ao ser criado e ao atualizar a SIPAT).

## 2. Roteiro sugerido para a demonstração (3 atos)

1. **Operador:** abre a Biblioteca, mostra as categorias e um assunto; entra numa empresa; monta a SIPAT arrastando assuntos para os dias.
2. **Administrador da empresa:** abre a mesma tela de SIPATs, confere os dias, publica; mostra cancelar e reativar.
3. **Participante:** entra, vê a trilha, assiste a um vídeo, conclui o dia, vê o próximo dia e o certificado.

## 3. Decisões que dependem do P.O.

| # | Decisão | Proposta |
|---|---------|----------|
| 1 | **Grades prontas ("Opção 1/2/3")** continuam como atalho para montar uma SIPAT? | Hoje o rótulo foi substituído por categoria. Se as grades prontas forem mantidas, tratá-las como "modelos de SIPAT" e não como rótulo de assunto. |
| 2 | **Entrada única na empresa** | Unificar "Entrar" e "Entrar no painel da empresa": o operador trabalha só dentro da área da empresa no ops; "Ver como administrador" só para conferência. |
| 3 | **Certificado personalizado por SIPAT** | Hoje é uma logo por empresa (planos Ouro e acima). Decidir plano (Ouro ou Diamante), campos (logo, texto, assinatura) e se há padrão da empresa. |
| 4 | **Plano Prata: customização por vídeo** | Não implementado; definir o que a Prata pode alterar. |
| 5 | **Vídeos internos da empresa (Diamante)** | Não implementado; definir fluxo de envio e quem aprova. |
| 6 | **Categorias** | Confirmar a lista inicial. O operador pode mudar a qualquer momento. |
| 7 | **Senha do operador** | Adiado. Recomendação: "senha de recuperação" na configuração do servidor (sem e-mail), depois tela "Alterar minha senha". |

## 4. Pendências técnicas antes de abrir para o cliente

- **Provedor de vídeo em produção** (maior pendência): hoje o armazenamento é arquivo local do servidor e os vídeos de demonstração são de teste. Falta decidir CDN ou streaming, custo e proteção de acesso.
- **Cadastro em massa dos 600+ colaboradores:** hoje é um por vez. Falta importação por planilha com validação e relatório de erros.
- **Ambiente de dev/homologação:** definir hospedagem, domínio, certificados, segredos e a senha inicial do operador.
- **Envio ao repositório e integração contínua:** o trabalho recente está em commits locais da branch `feat/course-editor-catalog`; ainda sem PR e sem pipeline.
- **Passe visual e de acessibilidade:** lateral nova do ops (sem barra superior), cabeçalhos compactos, celular.
- **Dados de demonstração:** há SIPATs duplicadas e antigas nos dados de teste que podem confundir; limpar antes de mostrar.
- **Operação do dia a dia:** acompanhamento de quem não concluiu, relatórios por SIPAT e avisos aos participantes não foram tratados nesta fase.

## 5. Riscos a acompanhar

- **Carga no go-live (novembro/2026, 600+ pessoas simultâneas):** nenhum teste de carga foi feito, principalmente no streaming de vídeo.
- **Mudança de modelo durante o uso:** reativar ou atualizar uma SIPAT em andamento preserva o progresso dos dias já iniciados, mas vale combinar com o cliente uma regra de congelamento a partir de uma data.
- **Perda de senha do operador:** sem recuperação por e-mail, depende de acesso ao servidor (ver decisão 7).
