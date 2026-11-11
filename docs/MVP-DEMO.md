# Demonstração local do MVP

## Percurso principal

1. Acesse o endereço da empresa e use uma conta de participante do arquivo local `.docker-local-credentials.txt`. Não versione nem compartilhe esse arquivo.
2. Em **Minha formação**, escolha um curso. Confira a lista de aulas, velocidade, controles nativos, retomada e progresso.
3. Assista ao vídeo. Questões na minutagem configurada pausam a reprodução; responda ou pule para continuar. Os jogos são opcionais e não concedem progresso de vídeo.
4. Em **Meus certificados**, a emissão só é liberada quando todos os cursos atribuídos à SIPAT estiverem concluídos e a empresa tiver logo cadastrada.
5. Na operação, abra uma empresa: **Cursos da empresa** distribui cursos publicados; **Logo do certificado** recebe um PNG de até 256 KB e 2000 × 2000 pixels; **Resultados** mostra atividades e documentos de cada colaborador.

O certificado incorpora a logo da contratante e preserva essa imagem no momento da emissão. A marca padrão do app usa a mesma arte do favicon. Configurar a logo do certificado não ativa personalização de cores ou do portal inteiro.

## Dados e segurança

- A demo contém dez empresas fictícias usando nomes de empresas reais, dois colaboradores por empresa e dezoito cursos atribuídos. Não representa contratação ou associação com essas marcas.
- Os títulos do catálogo foram organizados a partir da estrutura pública de `https://sipatonline.com.br/works.html`. Vídeos reais desse catálogo não foram copiados; a mídia usada no teste é demonstrativa.
- Migrações e a preparação de atividades são aditivas. Não é necessário apagar banco, volumes, matrículas ou progresso para atualizar.
- Cursos já distribuídos não mudam automaticamente quando o catálogo é editado. A associação repetida não cria outra matrícula nem reinicia o progresso.
- O supervisor não ganha acesso administrativo por existir neste MVP; relatórios específicos desse perfil continuam pendentes.

## Assets

| Asset | Origem e uso |
| --- | --- |
| Marca padrão | `public/favicon.svg`, arte do repositório, compartilhada pelo app e pela marca da plataforma no PDF. |
| Capa dos cursos | Seis fotografias locais obtidas de `images.unsplash.com`, sujeitas à [licença Unsplash](https://unsplash.com/license). Identificação individual dos autores não foi registrada nesta etapa. Revise a procedência antes de substituir por material comercial próprio. |
| Imagem de riscos | `public/risk-scene.svg`, ilustração criada para a demonstração, não uma avaliação de risco de ambiente real. |
| Fonte do PDF | Noto Sans Regular, projeto [Noto Fonts](https://github.com/notofonts/noto-fonts), com licença OFL incluída em `Learning/Assets`. |
| Vídeo curto | Amostra CC0 de flores publicada pela MDN. Não é palestra do catálogo comercial. |
| Logo Microsoft da demo | PNG público do domínio oficial `https://uhf.microsoft.com/images/microsoft/RE1Mu3b.png`, usado somente para identificar a empresa fictícia no teste local. A marca pertence à Microsoft; substitua pelo arquivo autorizado de cada contratante. |

Fotos, fonte e marca padrão são servidas localmente; o PDF não depende de downloads externos durante a geração.

## Limites antes de produção

O MVP local não é uma homologação de produção. O provedor de streaming e a evidência server-to-server permanecem pendentes: fora de Development, o sistema falha explicitamente sem um provedor configurado. Certificados da demo têm aviso demonstrativo, não assinatura digital, habilitação profissional ou validade regulatória presumida.

A restauração de dependências dentro do Docker pode exigir a cadeia de certificados corporativa correta. Não desative a validação TLS. A demo local pode ser empacotada usando o publish portátil feito no host com dependências já verificadas e o runtime Linux local existente.
