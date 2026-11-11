param(
    [ValidateSet('up', 'seed', 'reset', 'status', 'logs', 'stop')]
    [string]$Action = 'up',
    [switch]$Build,
    [switch]$ConfirmReset
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envFile = Join-Path $root '.env.docker.local'
$credentialsFile = Join-Path $root '.docker-local-credentials.txt'
$project = 'sipat-online-dev'
$apiImage = 'sipat-online-dev-api:local'
$webImage = "$project-web"

function Invoke-Compose {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker compose --project-directory $root --project-name $project --file (Join-Path $root 'compose.yaml') --env-file $envFile @args
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "Docker Compose falhou (codigo $exitCode)."
    }
}

function Test-LocalTenant([string]$HostName) {
    $probe = @'
const fs = require('fs');
const https = require('https');
const host = process.argv[2];
const paths = ['/app/node_modules/.vite/basic-ssl-demo/_cert.pem', '/app/node_modules/.vite/basic-ssl/_cert.pem'];
const pem = fs.readFileSync(paths.find(path => fs.existsSync(path)), 'utf8');
const certificate = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)[0];
const request = https.get({ hostname: '127.0.0.1', port: 5173, servername: host, path: '/api/tenant/branding', headers: { host }, ca: certificate }, response => {
  response.resume();
  response.on('end', () => { if (response.statusCode !== 200) { console.error(`HTTP ${response.statusCode}`); process.exitCode = 1; } });
});
request.on('error', error => { console.error(error.message); process.exitCode = 1; });
request.setTimeout(4000, () => request.destroy(new Error('timeout')));
'@
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @($probe | & docker compose --project-directory $root --project-name $project `
            --file (Join-Path $root 'compose.yaml') --env-file $envFile exec -T web node - $HostName 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return [pscustomobject]@{ Success = ($exitCode -eq 0); Detail = ($output -join ' ') }
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
if ($ConfirmReset -and $Action -ne 'reset') {
    throw '-ConfirmReset pode ser usado apenas com reset.'
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
        'TENANT_KEY=microsoft-demo'
        'TENANT_NAME=Microsoft'
        'TENANT_BASE_DOMAIN=localhost'
        'PLATFORM_HOST=ops.localhost'
        'DEVELOPMENT_SAMPLE_ENABLED=true'
        'DEMO_PRESENTATION_ENABLED=false'
        'DEMO_VIDEO_SIZE_BYTES=0'
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
        'Empresa: https://microsoft-demo.localhost:5188'
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

function Set-LocalSetting([string]$Key, [string]$Value) {
    $escapedKey = [regex]::Escape($Key)
    $lines = @(Get-Content -LiteralPath $envFile)
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^\s*$escapedKey=") {
            $lines[$index] = "$Key=$Value"
            $found = $true
        }
    }
    if (-not $found) {
        $lines += "$Key=$Value"
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($envFile, $lines, $encoding)
    $settings[$Key] = $Value
}

function Invoke-HostDatabaseInitializer([long]$VideoSizeBytes) {
    $apiProject = Join-Path $root 'src\Api\SipatOnline.Api\SipatOnline.Api.csproj'
    $environment = @{
        'ASPNETCORE_ENVIRONMENT' = 'Development'
        'ConnectionStrings__SipatOnline' = "Host=127.0.0.1;Port=$($settings['POSTGRES_PORT']);Database=$($settings['POSTGRES_DB']);Username=$($settings['POSTGRES_USER']);Password=$($settings['POSTGRES_PASSWORD'])"
        'SipatOnline__Tenant__Id' = $settings['TENANT_ID']
        'SipatOnline__Tenant__Key' = $settings['TENANT_KEY']
        'SipatOnline__Tenant__Name' = $settings['TENANT_NAME']
        'SipatOnline__Tenant__BaseDomain' = $settings['TENANT_BASE_DOMAIN']
        'SipatOnline__Tenant__PlatformHost' = $settings['PLATFORM_HOST']
        'SipatOnline__DevelopmentProxy__Host' = 'localhost'
        'SipatOnline__Learning__DevelopmentSampleEnabled' = 'true'
        'SipatOnline__Learning__DevelopmentSampleParticipant__LoginIdentifier' = $settings['DEVELOPMENT_SAMPLE_PARTICIPANT_LOGIN_IDENTIFIER']
        'SipatOnline__Learning__DevelopmentSampleParticipant__DisplayName' = $settings['DEVELOPMENT_SAMPLE_PARTICIPANT_DISPLAY_NAME']
        'SipatOnline__Learning__DevelopmentSampleParticipant__Password' = $settings['DEVELOPMENT_SAMPLE_PARTICIPANT_PASSWORD']
        'SipatOnline__DemoPresentation__Enabled' = 'true'
        'SipatOnline__DemoPresentation__VideoSizeBytes' = "$VideoSizeBytes"
        'SipatOnline__BootstrapAdmin__LoginIdentifier' = $settings['BOOTSTRAP_ADMIN_LOGIN_IDENTIFIER']
        'SipatOnline__BootstrapAdmin__DisplayName' = $settings['BOOTSTRAP_ADMIN_DISPLAY_NAME']
        'SipatOnline__BootstrapAdmin__Password' = $settings['BOOTSTRAP_ADMIN_PASSWORD']
        'SipatOnline__PlatformOperator__LoginIdentifier' = $settings['PLATFORM_OPERATOR_LOGIN_IDENTIFIER']
        'SipatOnline__PlatformOperator__DisplayName' = $settings['PLATFORM_OPERATOR_DISPLAY_NAME']
        'SipatOnline__PlatformOperator__Password' = $settings['PLATFORM_OPERATOR_PASSWORD']
    }
    $previous = @{}
    try {
        foreach ($key in $environment.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $environment[$key], 'Process')
        }
        Push-Location $root
        try {
            & dotnet run --no-restore --project $apiProject -- --initialize-database
            $exitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }
    }
    finally {
        foreach ($key in $environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
        }
    }
    if ($exitCode -ne 0) {
        throw "A inicializacao do banco local falhou (codigo $exitCode)."
    }
}

function Build-LocalApiImage([string]$PublishDirectory) {
    $apiProject = Join-Path $root 'src\Api\SipatOnline.Api\SipatOnline.Api.csproj'
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & dotnet publish $apiProject --configuration Release --no-restore `
            --output $PublishDirectory /p:UseAppHost=false --verbosity quiet
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            & docker build --quiet --file (Join-Path $root 'Dockerfile.local') --tag $apiImage $PublishDirectory
            $exitCode = $LASTEXITCODE
        }
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "A imagem local da API nao foi construida (codigo $exitCode); nenhum dado foi apagado."
    }
}

function Update-DemoCredentials {
    if (-not (Test-Path -LiteralPath $credentialsFile)) {
        throw "Arquivo local de credenciais nao encontrado: $credentialsFile"
    }
    $existing = [System.IO.File]::ReadAllText($credentialsFile)
    $marker = '## Contas da apresentacao demo (somente ambiente local)'
    $markerIndex = $existing.IndexOf($marker, [StringComparison]::Ordinal)
    if ($markerIndex -ge 0) {
        $existing = $existing.Substring(0, $markerIndex).TrimEnd()
    }
    $existing = [regex]::Replace(
        $existing,
        '(?im)^Participante:\s+participante\.demo\s*/[^\r\n]*(?:\r?\n)?',
        '')
    $section = [System.Collections.Generic.List[string]]::new()
    $section.Add($marker)
    $section.Add('Empresas ficticias de demonstracao; nao representam contas das empresas reais.')
    $section.Add('Senha compartilhada pelos colaboradores abaixo: ' + $settings['DEVELOPMENT_SAMPLE_PARTICIPANT_PASSWORD'])
    foreach ($company in @(
        @('microsoft-demo', 'Microsoft'), @('google-demo', 'Google'), @('amazon-demo', 'Amazon'),
        @('apple-demo', 'Apple'), @('meta-demo', 'Meta'), @('oracle-demo', 'Oracle'),
        @('ibm-demo', 'IBM'), @('netflix-demo', 'Netflix'), @('adobe-demo', 'Adobe'),
        @('salesforce-demo', 'Salesforce')
    )) {
        $section.Add("$($company[1]): https://$($company[0]).localhost:$($settings['WEB_PORT'])")
        $section.Add('  Colaboradores: maria.jose (Maria Jose Oliveira) e jose.maria (Jose Maria Santos)')
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $temporaryCredentialsFile = Join-Path $root ".docker-local-credentials.$([guid]::NewGuid().ToString('N')).tmp"
    $backupCredentialsFile = Join-Path $root ".docker-local-credentials.$([guid]::NewGuid().ToString('N')).backup.tmp"
    $replaced = $false
    try {
        [System.IO.File]::WriteAllText(
            $temporaryCredentialsFile,
            $existing.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine +
            ($section -join [Environment]::NewLine) + [Environment]::NewLine,
            $encoding)
        [System.IO.File]::Replace($temporaryCredentialsFile, $credentialsFile, $backupCredentialsFile)
        $replaced = $true
    }
    finally {
        if (Test-Path -LiteralPath $temporaryCredentialsFile) {
            Remove-Item -LiteralPath $temporaryCredentialsFile -Force
        }
        if ($replaced -and (Test-Path -LiteralPath $backupCredentialsFile)) {
            Remove-Item -LiteralPath $backupCredentialsFile -Force
        }
    }
}

switch ($Action) {
    'up' {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & docker image inspect $apiImage $webImage *> $null
            $imagesAvailable = $LASTEXITCODE -eq 0
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($Build -or -not $imagesAvailable) {
            Write-Host 'Construindo imagens locais...'
            Invoke-Compose build api web
        }
        Write-Host 'Iniciando PostgreSQL e verificando migrations e seed...'
        Invoke-Compose up -d --wait postgres
        Invoke-Compose run --rm --no-deps db-init
        Invoke-Compose up -d --no-build api web
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $probe = Test-LocalTenant $settings['PLATFORM_HOST']
            if ($probe.Success) {
                $ready = $true
                break
            }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) {
            throw "O portal nao respondeu corretamente: $($probe.Detail)"
        }
        Write-Host "Operacional: https://$($settings['PLATFORM_HOST']):$webPort ; empresa: https://$($settings['TENANT_KEY']).$($settings['TENANT_BASE_DOMAIN']):$webPort"
        Write-Host "Credenciais locais: $credentialsFile"
    }
    'seed' {
        Invoke-Compose up -d --wait postgres
        Invoke-Compose run --rm --no-deps db-init
    }
    'reset' {
        if (-not $ConfirmReset) {
            throw 'O reset apaga todos os dados do PostgreSQL local. Revise o escopo e execute novamente com -ConfirmReset.'
        }
        foreach ($key in @('TENANT_ID', 'TENANT_BASE_DOMAIN', 'PLATFORM_HOST', 'POSTGRES_DB',
                'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_PORT',
                'DEVELOPMENT_SAMPLE_PARTICIPANT_PASSWORD', 'BOOTSTRAP_ADMIN_LOGIN_IDENTIFIER',
                'BOOTSTRAP_ADMIN_PASSWORD', 'PLATFORM_OPERATOR_LOGIN_IDENTIFIER', 'PLATFORM_OPERATOR_PASSWORD')) {
            if ([string]::IsNullOrWhiteSpace($settings[$key])) {
                throw "Configuracao local obrigatoria ausente: $key"
            }
        }
        if ($settings['POSTGRES_PORT'] -notmatch '^\d+$' -or
            [int]$settings['POSTGRES_PORT'] -lt 1 -or [int]$settings['POSTGRES_PORT'] -gt 65535) {
            throw 'A porta PostgreSQL local e invalida.'
        }
        if (-not (Test-Path -LiteralPath $credentialsFile)) {
            throw "Arquivo local de credenciais nao encontrado: $credentialsFile"
        }

        $videoPath = Join-Path $env:TEMP "$project-demo-video-$([guid]::NewGuid().ToString('N')).mp4"
        $publishPath = Join-Path $env:TEMP "$project-api-publish-$([guid]::NewGuid().ToString('N'))"
        try {
            Write-Host 'Baixando uma unica amostra publica de video antes de alterar o banco...'
            Invoke-WebRequest -Uri 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' `
                -OutFile $videoPath -TimeoutSec 60 -UseBasicParsing
            $videoSize = (Get-Item -LiteralPath $videoPath).Length
            $stream = [System.IO.File]::OpenRead($videoPath)
            try {
                $header = New-Object byte[] 12
                $headerLength = $stream.Read($header, 0, $header.Length)
            }
            finally {
                $stream.Dispose()
            }
            if ($videoSize -lt 1024 -or $videoSize -gt 262144000 -or $headerLength -ne 12 -or
                [System.Text.Encoding]::ASCII.GetString($header, 4, 4) -ne 'ftyp') {
                throw 'O video de demonstracao baixado nao e um MP4 valido.'
            }

            $databaseVolume = "${project}_postgres-data"
            $mediaVolume = "${project}_platform-course-videos"
            & docker volume inspect $databaseVolume *> $null
            if ($LASTEXITCODE -ne 0) {
                throw "O volume PostgreSQL local esperado nao existe: $databaseVolume"
            }
            & docker volume inspect $mediaVolume *> $null
            if ($LASTEXITCODE -ne 0) {
                throw "O volume de videos local esperado nao existe: $mediaVolume"
            }
            $volumeConsumers = @(& docker ps -a --filter "volume=$databaseVolume" --format '{{.Names}}')
            if ($LASTEXITCODE -ne 0 -or
                @($volumeConsumers | Where-Object { $_ -ne "${project}-postgres-1" }).Count -gt 0) {
                throw 'O volume PostgreSQL possui consumidores inesperados; nenhum dado foi apagado.'
            }
            New-Item -ItemType Directory -Path $publishPath | Out-Null
            Build-LocalApiImage $publishPath
            Invoke-Compose build web

            Write-Host "Parando os servicos locais e apagando somente $databaseVolume..."
            Invoke-Compose stop api postgres
            Invoke-Compose rm -f postgres
            & docker volume rm $databaseVolume
            if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel remover o volume local do PostgreSQL.' }
            Set-LocalSetting 'TENANT_KEY' 'microsoft-demo'
            Set-LocalSetting 'TENANT_NAME' 'Microsoft'
            Set-LocalSetting 'DEMO_PRESENTATION_ENABLED' 'true'
            Set-LocalSetting 'DEMO_VIDEO_SIZE_BYTES' "$videoSize"
            Invoke-Compose up -d --wait postgres
            Invoke-HostDatabaseInitializer $videoSize
            Invoke-Compose up -d --no-build api web

            $ready = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                $probe = Test-LocalTenant $settings['PLATFORM_HOST']
                if ($probe.Success) { $ready = $true; break }
                Start-Sleep -Seconds 2
            }
            if (-not $ready) { throw "O portal local nao ficou pronto depois do reset: $($probe.Detail)" }

            $apiContainer = "${project}-api-1"
            $videoFile = ([guid]'c5000000-0000-4000-8000-000000000001').ToString('N') + '.video'
            $videoTarget = "/app/platform-course-videos/$videoFile"
            Invoke-Compose exec -T api mkdir -p /app/platform-course-videos
            & docker exec $apiContainer test -e $videoTarget
            $fileStatus = $LASTEXITCODE
            if ($fileStatus -eq 0) {
                $storedHash = (& docker exec $apiContainer sha256sum $videoTarget) -split '\s+' | Select-Object -First 1
                if ($LASTEXITCODE -ne 0 -or $storedHash -ne (Get-FileHash -LiteralPath $videoPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
                    throw 'O identificador do video demo ja pertence a outro arquivo; o volume foi preservado.'
                }
            }
            elseif ($fileStatus -eq 1) {
                & docker cp $videoPath "${apiContainer}:$videoTarget"
                if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar o video unico no volume de midia local.' }
            }
            else {
                throw 'Nao foi possivel verificar o volume de videos.'
            }

            $sql = 'SELECT (SELECT count(*) FROM tenancy."Tenants") || ''|'' || ' +
                   '(SELECT count(*) FROM identity."Users" u JOIN identity."AspNetUserRoles" ur ON ur."UserId"=u."Id" JOIN identity."AspNetRoles" r ON r."Id"=ur."RoleId" WHERE r."NormalizedName"=''PARTICIPANT'') || ''|'' || ' +
                   '(SELECT count(*) FROM learning."LearningTracks") || ''|'' || ' +
                   '(SELECT count(*) FROM learning."LearningAssignments") || ''|'' || ' +
                   '(SELECT count(*) FROM learning."LearningLessons") || ''|'' || ' +
                   '(SELECT count(*) FROM learning."PlatformCourses") || ''|'' || ' +
                   '(SELECT count(*) FROM learning."PlatformCourseVideos") || ''|'' || ' +
                   '(SELECT count(*) FROM learning."PlatformCourseVideoLinks") || ''|'' || ' +
                   '(SELECT count(*) FROM sipats."SipatEvents") || ''|'' || ' +
                   '(SELECT count(DISTINCT "ProviderAssetReference") FROM learning."LearningLessons");'
            $counts = $sql | & docker exec -i "${project}-postgres-1" psql -U $settings['POSTGRES_USER'] `
                -d $settings['POSTGRES_DB'] -t -A
            if ($LASTEXITCODE -ne 0 -or -not $counts -or $counts.Trim() -ne '10|20|180|360|1050|18|1|18|10|1') {
                throw "Validacao do seed falhou. Contagens locais: $counts"
            }
            $coverageSql = 'SELECT count(*) FROM identity."Users" u ' +
                           'JOIN identity."AspNetUserRoles" ur ON ur."UserId"=u."Id" ' +
                           'JOIN identity."AspNetRoles" r ON r."Id"=ur."RoleId" ' +
                           'WHERE r."NormalizedName"=''PARTICIPANT'' AND ' +
                           '(SELECT count(*) FROM learning."LearningAssignments" a ' +
                           'JOIN learning."LearningTracks" t ON t."Id"=a."TrackId" ' +
                           'WHERE a."ParticipantId"=u."Id" AND a."TenantId"=u."TenantId" ' +
                           'AND t."TenantId"=u."TenantId" AND a."RevokedAt" IS NULL)=18;'
            $coverage = $coverageSql | & docker exec -i "${project}-postgres-1" psql `
                -U $settings['POSTGRES_USER'] -d $settings['POSTGRES_DB'] -t -A
            if ($LASTEXITCODE -ne 0 -or -not $coverage -or $coverage.Trim() -ne '20') {
                throw "Validacao das trilhas dos colaboradores falhou: $coverage"
            }

            foreach ($key in @('microsoft-demo', 'google-demo', 'amazon-demo', 'apple-demo', 'meta-demo',
                    'oracle-demo', 'ibm-demo', 'netflix-demo', 'adobe-demo', 'salesforce-demo')) {
                $probe = Test-LocalTenant "$key.localhost"
                if (-not $probe.Success) {
                    throw "A empresa local $key nao respondeu corretamente: $($probe.Detail)"
                }
            }

            Update-DemoCredentials
            Write-Host 'Apresentacao demo pronta: 10 empresas, 20 colaboradores, 18 cursos, 180 trilhas e um unico video compartilhado.'
            Write-Host "Credenciais atualizadas em $credentialsFile"
        }
        finally {
            if (Test-Path -LiteralPath $videoPath) {
                Remove-Item -LiteralPath $videoPath -Force
            }
            if (Test-Path -LiteralPath $publishPath) {
                Remove-Item -LiteralPath $publishPath -Recurse -Force
            }
        }
    }
    'status' { Invoke-Compose ps }
    'logs' { Invoke-Compose logs --tail 100 -f api web }
    'stop' { Invoke-Compose stop }
}
