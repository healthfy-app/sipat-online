param(
    [ValidateSet('export', 'import')]
    [string]$Action = 'export',
    [switch]$IncludeLocalData,
    [switch]$ConfirmImport
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$project = 'sipat-online-dev'
$envFile = Join-Path $root '.env.docker.local'
$credentialsFile = Join-Path $root '.docker-local-credentials.txt'
$composeOptions = @('--project-directory', $root, '--project-name', $project,
    '--file', (Join-Path $root 'compose.yaml'), '--env-file', $envFile)

function Invoke-Docker {
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker @args
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "Docker falhou (codigo $code). A transferencia nao foi concluida." }
}

function Invoke-Compose { Invoke-Docker compose @composeOptions @args }

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Instale e inicie o Docker Desktop.' }
    Invoke-Docker info --format '{{.ServerVersion}}' | Out-Null
}

function Get-Container([string]$Service) {
    $ids = @(Invoke-Compose ps --all --quiet $Service)
    if ($ids.Count -ne 1 -or [string]::IsNullOrWhiteSpace($ids[0])) {
        throw "Container de $Service nao encontrado. Inicie o ambiente com .\docker-local.ps1 up."
    }
    return $ids[0].Trim()
}

function Get-PortableFiles([string]$Directory) {
    $excluded = @('.git', '.vs', '.vscode', '.idea', '.impeccable', '.copilot', '.terraform',
        'bin', 'obj', 'node_modules', 'dist', 'artifacts', 'TestResults', 'test-results',
        'playwright-report', 'local-data', 'coverage')
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force | Sort-Object Name) {
        if ($excluded -contains $item.Name) { continue }
        if ($item.Name -like '.env*' -and -not $item.Name.EndsWith('.example')) { continue }
        if ($item.Name -like '.docker-local-credentials*' -or
            $item.Name -match '(?i)\.(user|suo|rsuser|pfx|pem|key|log|zip|tfplan|tfvars)$|\.tfstate') { continue }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Link externo nao sera empacotado: $($item.Name). Revise-o antes de exportar."
        }
        if ($item.PSIsContainer) { Get-PortableFiles $item.FullName }
        else { $item }
    }
}

function Export-LocalData([string]$Directory) {
    Assert-Docker
    if (-not (Test-Path -LiteralPath $envFile) -or -not (Test-Path -LiteralPath $credentialsFile)) {
        throw 'Configuracao e documento de credenciais locais sao necessarios para transferir os dados.'
    }
    $postgres = Get-Container 'postgres'
    $api = Get-Container 'api'
    $running = @(Invoke-Compose ps --services --status running)
    if ($running -notcontains 'postgres' -or $running -notcontains 'api') {
        throw 'PostgreSQL e API precisam estar iniciados para exportar os dados e videos.'
    }
    New-Item -ItemType Directory -Path $Directory | Out-Null
    $temporary = "/tmp/sipat-transfer-$([guid]::NewGuid().ToString('N')).dump"
    $services = @($running | Where-Object { $_ -in @('api', 'web') })
    try {
        Invoke-Compose stop @services | Out-Null
        Invoke-Docker exec $postgres sh -c 'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --file="$1"' sh $temporary
        Invoke-Docker cp "${postgres}:$temporary" (Join-Path $Directory 'database.dump')
        $videos = Join-Path $Directory 'videos'
        New-Item -ItemType Directory -Path $videos | Out-Null
        Invoke-Docker cp "${api}:/app/platform-course-videos/." $videos
        Copy-Item -LiteralPath $envFile -Destination (Join-Path $Directory '.env.docker.local')
        Copy-Item -LiteralPath $credentialsFile -Destination (Join-Path $Directory '.docker-local-credentials.txt')
        $files = @(Get-ChildItem -LiteralPath $Directory -Recurse -File -Force | ForEach-Object {
            @{
                path = $_.FullName.Substring($Directory.Length + 1).Replace('\', '/')
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            }
        })
        $manifest = @{ version = 1; createdAt = [DateTimeOffset]::UtcNow.ToString('O'); files = $files }
        [IO.File]::WriteAllText((Join-Path $Directory 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5),
            (New-Object Text.UTF8Encoding($false)))
    }
    finally {
        Invoke-Docker exec $postgres rm -f $temporary
        Invoke-Compose start @services | Out-Null
    }
}

if ($Action -eq 'import') {
    if ($IncludeLocalData -or -not $ConfirmImport) { throw 'Use .\portable.ps1 import -ConfirmImport no computador de destino.' }
    Assert-Docker
    $data = Join-Path $root 'local-data'
    $manifestFile = Join-Path $data 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Este ZIP nao contem dados locais. Use .\docker-local.ps1 up -Build para criar um ambiente novo.' }
    $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
    if ($manifest.version -ne 1 -or @($manifest.files).Count -lt 3) { throw 'Manifesto de transferencia invalido.' }
    foreach ($entry in $manifest.files) {
        if ([IO.Path]::IsPathRooted($entry.path)) { throw 'Caminho absoluto no manifesto; importacao recusada.' }
        $file = [IO.Path]::GetFullPath((Join-Path $data $entry.path.Replace('/', '\')))
        if (-not $file.StartsWith("$data\", [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo de transferencia ausente ou invalido: $($entry.path)" }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) {
            throw "Checksum diferente: $($entry.path). Copie o ZIP novamente."
        }
    }
    foreach ($required in @('database.dump', '.env.docker.local', '.docker-local-credentials.txt')) {
        if (@($manifest.files | Where-Object { $_.path -eq $required }).Count -ne 1) { throw "Manifesto incompleto: $required." }
    }
    $existing = @(Invoke-Docker ps --all --quiet --filter "label=com.docker.compose.project=$project")
    $databaseVolume = @(Invoke-Docker volume ls --quiet --filter "name=^${project}_postgres-data$")
    $mediaVolume = @(Invoke-Docker volume ls --quiet --filter "name=^${project}_platform-course-videos$")
    if ($existing.Count -gt 0 -or $databaseVolume.Count -gt 0 -or $mediaVolume.Count -gt 0 -or
        (Test-Path -LiteralPath $envFile) -or (Test-Path -LiteralPath $credentialsFile)) {
        throw 'Ja existe um ambiente local neste PC. Nada sera sobrescrito; restaure somente em um destino novo.'
    }
    Copy-Item -LiteralPath (Join-Path $data '.env.docker.local') -Destination $envFile
    Copy-Item -LiteralPath (Join-Path $data '.docker-local-credentials.txt') -Destination $credentialsFile
    Invoke-Compose build api web
    Invoke-Compose up --detach --wait postgres
    $postgres = Get-Container 'postgres'
    $temporary = "/tmp/sipat-transfer-$([guid]::NewGuid().ToString('N')).dump"
    try {
        Invoke-Docker cp (Join-Path $data 'database.dump') "${postgres}:$temporary"
        Invoke-Docker exec $postgres sh -c 'exec pg_restore --exit-on-error --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" "$1"' sh $temporary
    }
    finally { Invoke-Docker exec $postgres rm -f $temporary }
    Invoke-Compose create --no-build api
    $api = Get-Container 'api'
    $videos = Join-Path $data 'videos'
    if (Test-Path -LiteralPath $videos -PathType Container) {
        Invoke-Docker cp (Join-Path $videos '.') "${api}:/app/platform-course-videos"
    }
    Invoke-Compose run --rm --no-deps -e SipatOnline__DemoPresentation__Enabled=false -e SipatOnline__Learning__DevelopmentSampleEnabled=false db-init
    Invoke-Compose up --detach api web
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker compose @composeOptions exec -T api curl --fail --silent http://127.0.0.1:8080/health 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Dados importados, mas a API nao ficou pronta. Consulte .\docker-local.ps1 logs; nao repita a importacao.' }
    Write-Host 'Importacao concluida, sem reset ou recriacao dos dados de demonstracao.'
    Write-Host 'Abra https://ops.localhost:5188 ou https://microsoft-demo.localhost:5188 e entre novamente.'
    Write-Host 'As credenciais continuam em .docker-local-credentials.txt. O navegador pode avisar sobre o certificado local.'
    exit
}

if ($ConfirmImport) { throw '-ConfirmImport so pode ser usado com import.' }
$files = @(Get-PortableFiles $root)
$textExtensions = @('.ps1', '.cs', '.csproj', '.json', '.ts', '.tsx', '.js', '.md', '.yaml', '.yml', '.tf', '.props', '.targets', '.config', '.css', '.html')
foreach ($file in $files) {
    if ($textExtensions -contains $file.Extension -and
        [IO.File]::ReadAllText($file.FullName) -match '(?i)[a-z]:[\\/](Users|Documents and Settings)[\\/]|(?<![\w/])/(Users|home)/') {
        throw "Referencia a diretorio de usuario em $($file.FullName.Substring($root.Length + 1)). Corrija antes de exportar."
    }
}
$output = Join-Path $root 'artifacts\portable'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$data = $null
if ($IncludeLocalData) {
    Write-Warning 'PACOTE PRIVADO: inclui banco, videos e credenciais. Transfira apenas para seu outro PC; nao publique o ZIP.'
    $data = Join-Path $output "data-$([guid]::NewGuid().ToString('N'))"
    Export-LocalData $data
}
$suffix = if ($IncludeLocalData) { 'PRIVATE' } else { 'source' }
$archivePath = Join-Path $output "SipatOnline-$suffix-$stamp.zip"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pendingPath = "$archivePath.partial"
$stream = [IO.File]::Open($pendingPath, [IO.FileMode]::CreateNew)
$archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative) | Out-Null
    }
    if ($data) {
        foreach ($file in Get-ChildItem -LiteralPath $data -Recurse -File -Force) {
            $relative = 'local-data/' + $file.FullName.Substring($data.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative) | Out-Null
        }
    }
}
finally { $archive.Dispose(); $stream.Dispose() }
Move-Item -LiteralPath $pendingPath -Destination $archivePath
Write-Host "ZIP criado: $archivePath"
Write-Host 'Extraia em qualquer pasta do outro PC. As instrucoes de inicializacao e transferencia estao no README.md.'
