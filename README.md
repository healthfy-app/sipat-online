# SIPAT Online

O SIPAT Online oferece o conteúdo digital das palestras de uma SIPAT em formato EAD. A SIPAT é um evento de realização obrigatória no contexto legal e de segurança do trabalho; a plataforma é um meio para realizar esse evento e engajar os participantes com soluções de aprendizagem úteis para sua vida profissional e pessoal.

O projeto está em fase inicial de desenvolvimento. A solução e os projetos-base estão criados; as funcionalidades de negócio ainda serão implementadas por camadas, começando pelo domínio.

## Objetivos

- Organizar SIPATs de empresas e disponibilizar os conteúdos digitais das palestras.
- Engajar participantes com uma experiência EAD adequada às necessidades do aluno moderno.
- Comprovar participação por conteúdo assistido e carga horária, com relatórios e certificados.
- Permitir que empresas acompanhem a participação individual e por grupos e subgrupos.
- Apoiar uma migração gradual do sistema atual, preservando o histórico necessário.
- Manter uma arquitetura simples de evoluir, em um monólito modular.

## Perfis e capacidades

| Perfil | Capacidades previstas |
| --- | --- |
| Super Admin | Acesso global e sem restrições funcionais; gestão de usuários e relatórios individuais, por grupo e subgrupo de todas as SIPATs. As ações administrativas devem permanecer auditáveis. |
| Admin do cliente | Acesso aos relatórios das SIPATs da sua empresa às quais recebeu acesso; consulta da participação individual e por grupos e subgrupos, conteúdos e carga horária; moderação de comentários. |
| Participante | Consulta do próprio conteúdo assistido e progresso, comentários nos vídeos, reprodução com retrocesso e emissão do próprio certificado quando cumprir os critérios. |

O acesso de Admin do cliente deve ser limitado à empresa e às SIPATs autorizadas, sem expor dados de outros clientes. A regra detalhada de como esse acesso é concedido será definida no domínio de Identity/Corporate.

## Regras de participação e vídeo

- O participante pode retroceder a reprodução, mas não avançar para uma posição ainda não assistida.
- Admins autorizados podem avançar e retroceder vídeos para fins de gestão e acompanhamento.
- O progresso deve refletir conteúdo efetivamente assistido; buscar até o final do vídeo, por si só, não comprova conclusão.
- Comentários são associados ao conteúdo e podem ser moderados por Admin do cliente.
- Relatórios registram participação individual e agregada por grupos e subgrupos, discriminando conteúdos e carga horária.
- A emissão do certificado depende do cumprimento dos critérios de participação da SIPAT e deve registrar a carga horária correspondente.

O controle de avanço precisa ser validado tecnicamente com o provedor de vídeo escolhido: não basta esconder o botão de avanço no player se a URL do vídeo puder ser acessada por fora ou se o progresso puder ser forjado pelo cliente.

## Linguagem do produto

- **SIPAT:** evento de segurança e prevenção do trabalho, não um curso.
- **SIPAT Online:** plataforma e conteúdo digital das palestras de uma SIPAT em formato EAD.
- **Participante:** pessoa que acessa os conteúdos da SIPAT.
- **Conteúdo/Palestra:** material de aprendizagem disponibilizado durante a SIPAT.
- **Participação:** realização dos conteúdos e carga horária computados para uma pessoa em uma SIPAT.
- **Grupo/Subgrupo:** agrupamento organizacional usado para segmentar participantes e relatórios.

## Tecnologias

- .NET 10 e C# 14
- ASP.NET Core Minimal API
- xUnit
- Nullable habilitado e warnings tratados como erros

## Estrutura da solução

```text
SipatOnline.slnx
src/
  SipatOnline.Api/
  SipatOnline.BuildingBlocks.Application/
  SipatOnline.BuildingBlocks.Domain/
  SipatOnline.Identity.Application/
  SipatOnline.Identity.Domain/
tests/
  SipatOnline.Application.UnitTests/
  SipatOnline.ArchitectureTests/
  SipatOnline.Domain.UnitTests/
  SipatOnline.IntegrationTests/
```

Os projetos ficam diretamente em `src/` e `tests/` para manter a estrutura enxuta. As camadas e módulos são separados por projeto, não por vários níveis de diretórios.

## Pré-requisitos

- SDK do .NET 10
- Git

Confira o SDK ativo na raiz do repositório:

```powershell
dotnet --version
```

O arquivo `global.json` fixa a família do SDK em .NET 10.

## Restaurar, compilar e testar

Execute os comandos a partir da raiz do repositório:

```powershell
dotnet restore SipatOnline.slnx
dotnet build SipatOnline.slnx --no-restore
dotnet test SipatOnline.slnx --no-build
```

## Executar a API

```powershell
dotnet run --project src\SipatOnline.Api\SipatOnline.Api.csproj
```

A API fornece o endpoint `GET /health`. A especificação OpenAPI é disponibilizada em ambiente de desenvolvimento.

## Decisões de produto já definidas

- O foco inicial é B2B: empresas contratam o serviço e acompanham seus colaboradores.
- Matrículas não exigem CPF. O vínculo do participante é associado à empresa e à matrícula.
- Pagamentos e checkout acontecem fora da plataforma e não fazem parte do escopo inicial.
- Os vídeos são de autoria própria; o provedor de hospedagem ainda será escolhido.
- A plataforma pode adotar padrões funcionais comuns a produtos de aprendizagem, mantendo marca, interface e conteúdo originais.
- A plataforma entrega o conteúdo digital do evento SIPAT; não deve tratar a SIPAT como sinônimo de curso.

## Próximas etapas

1. Validar os critérios de participação, cálculo de carga horária e emissão de certificados com o negócio.
2. Definir como grupos/subgrupos são organizados e como Admins do cliente recebem acesso a SIPATs.
3. Implementar e testar as regras do domínio, começando por Identity e pelos vínculos entre empresa, usuário e SIPAT.
4. Avançar para Application e, depois, para infraestrutura e integração com a API.
5. Definir o provedor de vídeo por meio de uma prova de conceito que avalie privacidade, reprodução incorporada, bloqueio de avanço, legendas, progresso, interatividade, custos e portabilidade.
6. Validar os formatos de exportação e os volumes de dados do sistema atual antes de detalhar a migração.

## Segurança e configuração

Não armazene senhas, tokens, chaves ou outras credenciais neste repositório. Configurações locais e segredos de desenvolvimento devem ser fornecidos por mecanismos apropriados, como User Secrets ou variáveis de ambiente.
