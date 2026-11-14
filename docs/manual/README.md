# Manual do usuário (PDF)

Fonte do manual: `manual.html`. As imagens (`shots/`) e o PDF são gerados e não ficam no Git.

1. Suba o ambiente local (`./docker-local.ps1 up -Build`).
2. `capture.cjs` percorre o ambiente de demonstração com o Chrome (via `puppeteer-core`) e grava as capturas em `shots/`. Ele lê as credenciais locais de `.docker-local-credentials.txt`; nada é impresso.
3. `pdf.cjs` gera `SIPAT-Online-Manual.pdf` a partir de `manual.html`.

Dependências (fora do repositório): `npm i puppeteer-core`. Todas as telas são do ambiente fictício; o manual avisa isso logo no início.
