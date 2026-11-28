# Gera as contas de teste do teste de carga, com senha aleatória por conta.
#   dados\carga-1.csv, carga-2.csv...  planilhas para a carga do RH (Login, Senha, Nome completo), 2000 linhas cada
#   dados\acessos.csv                  login,senha de todas, lido pelo k6
# A pasta dados fica fora do Git. Apague-a depois do teste.
param(
    [int]$Total = 5000,
    [int]$PorPlanilha = 2000
)

$ErrorActionPreference = 'Stop'
$pasta = Join-Path $PSScriptRoot 'dados'
New-Item -ItemType Directory -Force $pasta | Out-Null
Get-ChildItem $pasta -Filter '*.csv' | Remove-Item -Confirm:$false

$letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'.ToCharArray()
function New-Senha {
    -join (1..14 | ForEach-Object { $letras[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($letras.Length)] })
}

$acessos = [System.Collections.Generic.List[string]]::new()
$acessos.Add('login,senha')
$planilha = $null
$numero = 0
for ($i = 1; $i -le $Total; $i++) {
    if (($i - 1) % $PorPlanilha -eq 0) {
        if ($planilha) { [System.IO.File]::WriteAllLines((Join-Path $pasta "carga-$numero.csv"), $planilha) }
        $numero++
        $planilha = [System.Collections.Generic.List[string]]::new()
        $planilha.Add('Login,Senha,Nome completo')
    }
    $login = 'carga{0:D4}' -f $i
    $senha = New-Senha
    $planilha.Add("$login,$senha,Teste de Carga $('{0:D4}' -f $i)")
    $acessos.Add("$login,$senha")
}
[System.IO.File]::WriteAllLines((Join-Path $pasta "carga-$numero.csv"), $planilha)
[System.IO.File]::WriteAllLines((Join-Path $pasta 'acessos.csv'), $acessos)

"$Total contas em $numero planilhas, em $pasta"
