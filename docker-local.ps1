param(
    [ValidateSet('up', 'seed', 'status', 'logs', 'stop')]
    [string]$Action = 'up',
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envFile = Join-Path $root '.env.docker.local'
$credentialsFile = Join-Path $root '.docker-local-credentials.txt'
$project = 'sipat-online-dev'
$apiImage = 'sipat-online-dev-api:local'
$webImage = "$project-web"

function Invoke-Compose {
    & docker compose --project-directory $root --project-name $project --file (Join-Path $root 'compose.yaml') --env-file $envFile @args
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose falhou (codigo $LASTEXITCODE)."
    }
}

function New-LocalPassword {
    $bytes = New-Object byte[] 24
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    }
    finally {
        $random.Dispose()
    }
    return 'Aa1!' + ([BitConverter]::ToString($bytes).Replace('-', ''))
}

if ($Build -and $Action -ne 'up') {
    throw '-Build pode ser usado apenas com up.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker nao encontrado. Instale e inicie o Docker Desktop.'
}
& docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop nao esta pronto. Inicie-o e tente novamente.'
}

if (-not (Test-Path -LiteralPath $envFile)) {
    if ($Action -ne 'up') {
        throw 'Ambiente local nao configurado. Execute .\docker-local.ps1 up primeiro.'
    }
    if (Test-Path -LiteralPath $credentialsFile) {
        throw 'Arquivo de credenciais ja existe sem configuracao; nao sera sobrescrito.'
    }
    $volumeName = "${project}_postgres-data"
    $existingVolumes = & docker volume ls --quiet --filter "name=^${volumeName}$"
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel verificar o volume local do banco.'
    }
    if ($existingVolumes -contains $volumeName) {
        throw 'O volume do banco ja existe sem o arquivo de configuracao. Recupere .env.docker.local; ele nao sera substituido.'
    }
    $databasePassword = New-LocalPassword
    $participantPassword = New-LocalPassword
    $adminPassword = New-LocalPassword
    $operatorPassword = New-LocalPassword
    $configuration = @(
        'POSTGRES_DB=sipat_online'
        'POSTGRES_USER=sipat_online'
        "POSTGRES_PASSWORD=$databasePassword"
        'POSTGRES_PORT=5438'
        'API_PORT=8088'
        'WEB_PORT=5188'
        'LOCAL_BIND_ADDRESS=127.0.0.1'
        "SIPAT_API_IMAGE=$apiImage"
        'TENANT_ID=11111111-1111-1111-1111-111111111111'
        'TENANT_KEY=sipat-online-local'
        'TENANT_NAME=SIPAT Online Local'
        'TENANT_BASE_DOMAIN=localhost'
        'PLATFORM_HOST=ops.localhost'
        'DEVELOPMENT_SAMPLE_ENABLED=true'
        'DEVELOPMENT_SAMPLE_PARTICIPANT_LOGIN_IDENTIFIER=participante.demo'
        'DEVELOPMENT_SAMPLE_PARTICIPANT_DISPLAY_NAME=Participante de demonstracao'
        "DEVELOPMENT_SAMPLE_PARTICIPANT_PASSWORD=$participantPassword"
        'BOOTSTRAP_ADMIN_LOGIN_IDENTIFIER=admin.demo'
        'BOOTSTRAP_ADMIN_DISPLAY_NAME=Administrador de demonstracao'
        "BOOTSTRAP_ADMIN_PASSWORD=$adminPassword"
        'PLATFORM_OPERATOR_LOGIN_IDENTIFIER=operador.demo'
        'PLATFORM_OPERATOR_DISPLAY_NAME=Operador de demonstracao'
        "PLATFORM_OPERATOR_PASSWORD=$operatorPassword"
    )
    $credentials = @(
        'SIPAT Online - credenciais locais de desenvolvimento'
        'Somente para uso local. Nao compartilhar nem usar em producao.'
        ''
        'Tenant: https://localhost:5188'
        "Participante: participante.demo / $participantPassword"
        "Administrador da empresa: admin.demo / $adminPassword"
        ''
        'Operacao: https://ops.localhost:5188'
        "Operador da plataforma: operador.demo / $operatorPassword"
        ''
        'PostgreSQL: localhost:5438, banco e usuario sipat_online'
        "Senha PostgreSQL: $databasePassword"
        ''
        'O seed nao altera a senha de contas ja existentes.'
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($envFile, $configuration, $encoding)
    [System.IO.File]::WriteAllLines($credentialsFile, $credentials, $encoding)
    Write-Host "Configuracao e credenciais locais criadas em $credentialsFile"
}
elseif (-not (Test-Path -LiteralPath $credentialsFile)) {
    Write-Warning 'O documento local de credenciais nao foi encontrado; ele nao sera recriado com senhas possivelmente incorretas.'
}

$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $settings[$Matches[1]] = $Matches[2]
    }
}
foreach ($key in $settings.Keys) {
    if ([Environment]::GetEnvironmentVariable($key, 'Process')) {
        throw "A variavel $key esta definida no processo e sobrescreveria a configuracao local. Remova-a antes de continuar."
    }
    $apiImage = $settings['SIPAT_API_IMAGE']
    $webPort = $settings['WEB_PORT']
    if (-not $apiImage -or $webPort -notmatch '^\d+$' -or [int]$webPort -lt 1 -or [int]$webPort -gt 65535) {
        throw 'SIPAT_API_IMAGE e WEB_PORT validos sao obrigatorios no arquivo local.'
    }
}

switch ($Action) {
    'up' {
        & docker image inspect $apiImage $webImage *> $null
        if ($Build -or $LASTEXITCODE -ne 0) {
            Write-Host 'Construindo imagens locais...'
            Invoke-Compose build api web
        }
        Write-Host 'Iniciando PostgreSQL e verificando migrations e seed...'
        Invoke-Compose up -d --wait postgres
        Invoke-Compose run --rm --no-deps db-init
        Invoke-Compose up -d --no-build api web
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $status = & curl.exe -k -s --max-time 2 -o NUL -w '%{http_code}' "https://localhost:$webPort/api/tenant/branding"
            if ($LASTEXITCODE -eq 0 -and $status -eq '200') {
                $ready = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) {
            throw 'O portal nao respondeu corretamente. Execute .\docker-local.ps1 logs para diagnosticar.'
        }
        Write-Host "Acesse https://localhost:$webPort (o certificado local pode exigir confirmacao)."
        Write-Host "Credenciais locais: $credentialsFile"
    }
    'seed' {
        Invoke-Compose up -d --wait postgres
        Invoke-Compose run --rm --no-deps db-init
    }
    'status' { Invoke-Compose ps }
    'logs' { Invoke-Compose logs --tail 100 -f api web }
    'stop' { Invoke-Compose stop }
}
