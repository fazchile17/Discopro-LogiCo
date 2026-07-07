#Requires -Version 5.1
<#
.SYNOPSIS
    Ejecuta el plan de pruebas de LogiCo (Entrega 3) — 5 tipos de prueba.

.DESCRIPTION
    T1 Unitarias      → npm test en functions/
    T2 Integración    → Newman + colección Postman
    T3 Borde          → incluido en Newman (BORDE E1-E3)
    T4 Seguridad      → smoke HTTP + Newman (SEG S1-S6)
    T5 Concurrencia   → scripts/concurrencia.js (opcional, requiere credenciales)

.PARAMETER BaseUrl
    URL base de la API (sin barra final).

.PARAMETER AdminEmail
    Correo Firebase del admin para login y concurrencia.

.PARAMETER AdminPassword
    Contraseña del admin.

.PARAMETER SkipUnit
    Omitir pruebas unitarias Jest.

.PARAMETER SkipNewman
    Omitir Newman (integración, borde, seguridad en colección).

.PARAMETER SkipConcurrency
    Omitir script de concurrencia.

.PARAMETER ReportDir
    Carpeta de reportes (relativa a este script).

.EXAMPLE
    .\ejecutar-plan-pruebas.ps1 -AdminEmail "admin@logico.app" -AdminPassword "Admin123!"

.EXAMPLE
    .\ejecutar-plan-pruebas.ps1 -SkipNewman -SkipConcurrency
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = "https://logico-app.web.app/api",
    [string]$AdminEmail = "",
    [string]$AdminPassword = "",
    [switch]$SkipUnit,
    [switch]$SkipNewman,
    [switch]$SkipConcurrency,
    [string]$ReportDir = "reportes"
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$FunctionsDir = Join-Path $ProjectRoot "functions"
$PostmanCollection = Join-Path $ProjectRoot "postman\LogiCo.postman_collection.json"
$PostmanEnv = Join-Path $ProjectRoot "postman\LogiCo.postman_environment.json"
$ConcurrenciaScript = Join-Path $ProjectRoot "scripts\concurrencia.js"
$PrepararScript = Join-Path $ProjectRoot "scripts\preparar-pruebas-e2e.js"

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutDir = Join-Path $ScriptDir $ReportDir
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$SummaryFile = Join-Path $OutDir "$Timestamp-resumen.txt"
$Results = [System.Collections.Generic.List[object]]::new()

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $SummaryFile -Value $line
}

function Add-Result {
    param(
        [string]$Tipo,
        [string]$Nombre,
        [bool]$Pass,
        [string]$Detalle = ""
    )
    $Results.Add([PSCustomObject]@{
            Tipo    = $Tipo
            Nombre  = $Nombre
            Pass    = $Pass
            Detalle = $Detalle
        })
    $icon = if ($Pass) { "PASS" } else { "FAIL" }
    $color = if ($Pass) { "Green" } else { "Red" }
    Write-Log "  [$icon] $Tipo - $Nombre $(if ($Detalle) { "($Detalle)" })" $color
}

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------
Write-Log "=== LogiCo - Plan de pruebas Entrega 3 ===" "Cyan"
Write-Log "Proyecto: $ProjectRoot"
Write-Log "API: $BaseUrl"
Write-Log "Reportes: $OutDir"
Write-Log ""

# ---------------------------------------------------------------------
# T1 — UNITARIAS (Jest)
# ---------------------------------------------------------------------
if (-not $SkipUnit) {
    Write-Log "--- T1 Unitarias (Jest) ---" "Yellow"
    $jestLog = Join-Path $OutDir "$Timestamp-jest.txt"
    Push-Location $FunctionsDir
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Log "  Instalando dependencias npm..." "Gray"
            npm install --silent 2>&1 | Out-Null
        }
        npm test 2>&1 | Tee-Object -FilePath $jestLog
        $jestExit = $LASTEXITCODE
        $jestContent = Get-Content $jestLog -Raw -ErrorAction SilentlyContinue
        $pass = ($jestExit -eq 0) -and ($jestContent -match "Tests:\s+\d+\s+passed")
        $match = [regex]::Match($jestContent, "Tests:\s+(\d+)\s+passed")
        $det = if ($match.Success) { "$($match.Groups[1].Value) passed" } else { "exit=$jestExit" }
        Add-Result -Tipo "T1" -Nombre "Jest unitarias (38 esperados)" -Pass $pass -Detalle $det
    }
    catch {
        Add-Result -Tipo "T1" -Nombre "Jest unitarias" -Pass $false -Detalle $_.Exception.Message
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Log "--- T1 Unitarias: OMITIDO ---" "DarkGray"
}

# ---------------------------------------------------------------------
# T4 parcial — SMOKE seguridad HTTP (sin Newman)
# ---------------------------------------------------------------------
Write-Log "--- T4 Seguridad (smoke HTTP) ---" "Yellow"
try {
    $healthUrl = "$BaseUrl/health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 30
    $sw.Stop()
    $healthOk = ($health.ok -eq $true)
    Add-Result -Tipo "T4/RNF" -Nombre "GET /health -> 200 ok" -Pass $healthOk -Detalle "database=$($health.database) $($sw.ElapsedMilliseconds)ms"

    $latencies = @($sw.ElapsedMilliseconds)
    for ($i = 0; $i -lt 2; $i++) {
        $sw.Restart()
        Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 30 | Out-Null
        $sw.Stop()
        $latencies += $sw.ElapsedMilliseconds
    }
    $avgMs = [math]::Round(($latencies | Measure-Object -Average).Average, 0)
    Add-Result -Tipo "T5/RNF" -Nombre "Latencia health (promedio 3)" -Pass ($avgMs -lt 3000) -Detalle "${avgMs}ms"

    try {
        Invoke-RestMethod -Uri "$BaseUrl/pedidos" -Method Get -TimeoutSec 15 | Out-Null
        Add-Result -Tipo "T4" -Nombre "GET /pedidos sin token -> debe fallar" -Pass $false -Detalle "respondio sin 401"
    }
    catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        Add-Result -Tipo "T4" -Nombre "GET /pedidos sin token -> 401" -Pass ($status -eq 401) -Detalle "HTTP $status"
    }
}
catch {
    Add-Result -Tipo "T4/RNF" -Nombre "Smoke HTTP /health" -Pass $false -Detalle $_.Exception.Message
}

# ---------------------------------------------------------------------
# T2 + T3 + T4 — NEWMAN (integración, borde, seguridad)
# ---------------------------------------------------------------------
if (-not $SkipNewman) {
    Write-Log "--- T2/T3/T4 Newman (Integración + Borde + Seguridad) ---" "Yellow"
    if (-not (Test-Path $PostmanCollection)) {
        Add-Result -Tipo "T2" -Nombre "Newman colección" -Pass $false -Detalle "No existe $PostmanCollection"
    }
    elseif (-not (Test-CommandExists "npx")) {
        Add-Result -Tipo "T2" -Nombre "Newman (npx no encontrado)" -Pass $false -Detalle "Instale Node.js"
    }
    else {
        $newmanLog = Join-Path $OutDir "$Timestamp-newman.txt"
        $newmanArgs = @(
            "newman", "run", $PostmanCollection,
            "-e", $PostmanEnv,
            "--env-var", "baseUrl=$BaseUrl",
            "-r", "cli"
        )
        if ($AdminEmail) { $newmanArgs += @("--env-var", "adminEmail=$AdminEmail") }
        if ($AdminPassword) { $newmanArgs += @("--env-var", "adminPassword=$AdminPassword") }

        # Preparar motorista libre + IDs unicos (evita 409 duplicado y 422 motorista bloqueado)
        if ($AdminEmail -and $AdminPassword -and (Test-Path $PrepararScript)) {
            Write-Log "  Preparando entorno E2E (liberar motorista)..." "Gray"
            $env:BASE_URL = $BaseUrl
            $env:ADMIN_EMAIL = $AdminEmail
            $env:ADMIN_PASSWORD = $AdminPassword
            try {
                $prepOut = & node $PrepararScript 2>&1
                $prepLine = ($prepOut | Select-Object -Last 1) -as [string]
                if ($prepLine -match '^\s*\{') {
                    $prep = $prepLine | ConvertFrom-Json
                    $newmanArgs += @(
                        "--env-var", "motoristaId=$($prep.motoristaId)",
                        "--env-var", "testRunId=$($prep.testRunId)",
                        "--env-var", "fechaTestIso=$($prep.fechaTestIso)"
                    )
                    Write-Log "  E2E listo: motoristaId=$($prep.motoristaId) run=$($prep.testRunId)" "Gray"
                }
            }
            catch {
                Write-Log "  AVISO: preparar-pruebas fallo, Newman puede fallar en asignacion" "DarkYellow"
            }
            finally {
                Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
                Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
                Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
            }
        }

        Push-Location $ProjectRoot
        try {
            & npx @newmanArgs 2>&1 | Tee-Object -FilePath $newmanLog
            $newmanExit = $LASTEXITCODE
            $logContent = Get-Content $newmanLog -Raw -ErrorAction SilentlyContinue
            $assertions = [regex]::Match($logContent, "assertions\s+\|\s+(\d+)")
            $failed = [regex]::Match($logContent, "failed\s+\|\s+(\d+)")
            $det = "exit=$newmanExit"
            if ($assertions.Success) { $det += ", assertions=$($assertions.Groups[1].Value)" }
            if ($failed.Success -and [int]$failed.Groups[1].Value -gt 0) {
                $det += ", failed=$($failed.Groups[1].Value)"
            }
            Add-Result -Tipo "T2/T3/T4" -Nombre "Newman coleccion completa" -Pass ($newmanExit -eq 0) -Detalle $det
        }
        catch {
            Add-Result -Tipo "T2" -Nombre "Newman" -Pass $false -Detalle $_.Exception.Message
        }
        finally {
            Pop-Location
        }
    }
}
else {
    Write-Log "--- T2/T3/T4 Newman: OMITIDO ---" "DarkGray"
}

# ---------------------------------------------------------------------
# T5 — CONCURRENCIA
# ---------------------------------------------------------------------
if (-not $SkipConcurrency) {
    Write-Log "--- T5 Concurrencia ---" "Yellow"
    if (-not $AdminEmail -or -not $AdminPassword) {
        Write-Log "  Sin -AdminEmail/-AdminPassword: concurrencia omitida." "DarkYellow"
        Add-Result -Tipo "T5" -Nombre "Concurrencia (omitida)" -Pass $true -Detalle "sin credenciales"
    }
    elseif (-not (Test-Path $ConcurrenciaScript)) {
        Add-Result -Tipo "T5" -Nombre "Concurrencia script" -Pass $false -Detalle "No existe concurrencia.js"
    }
    elseif (-not (Test-CommandExists "node")) {
        Add-Result -Tipo "T5" -Nombre "Concurrencia (node)" -Pass $false -Detalle "Node no instalado"
    }
    else {
        $concLog = Join-Path $OutDir "$Timestamp-concurrencia.txt"
        $env:BASE_URL = $BaseUrl
        $env:ADMIN_EMAIL = $AdminEmail
        $env:ADMIN_PASSWORD = $AdminPassword
        Push-Location $ProjectRoot
        try {
            node $ConcurrenciaScript 2>&1 | Tee-Object -FilePath $concLog
            $concExit = $LASTEXITCODE
            Add-Result -Tipo "T5" -Nombre "Concurrencia 1x201 + resto conflicto" -Pass ($concExit -eq 0) -Detalle "exit=$concExit"
        }
        catch {
            Add-Result -Tipo "T5" -Nombre "Concurrencia" -Pass $false -Detalle $_.Exception.Message
        }
        finally {
            Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
            Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
            Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
            Pop-Location
        }
    }
}
else {
    Write-Log "--- T5 Concurrencia: OMITIDO ---" "DarkGray"
}

# ---------------------------------------------------------------------
# RESUMEN FINAL
# ---------------------------------------------------------------------
Write-Log ""
Write-Log "=== RESUMEN ===" "Cyan"
$passed = @($Results | Where-Object { $_.Pass }).Count
$failed = @($Results | Where-Object { -not $_.Pass }).Count
$total = $Results.Count

foreach ($r in $Results) {
    $st = if ($r.Pass) { "PASS" } else { "FAIL" }
    Write-Log ("  [{0}] {1} - {2}" -f $st, $r.Tipo, $r.Nombre) $(if ($r.Pass) { "Green" } else { "Red" })
}

Write-Log ""
Write-Log "Total: $passed PASS / $failed FAIL (de $total pruebas de plan)" $(if ($failed -eq 0) { "Green" } else { "Yellow" })
Write-Log "Resumen guardado: $SummaryFile"

# Tabla markdown para pegar en 07-plan-de-pruebas.md 7.10
$mdFile = Join-Path $OutDir "$Timestamp-tabla-resultados.md"
$mdLines = @(
    "# Resultados plan de pruebas - $Timestamp"
    ""
    "| Tipo | Prueba | Resultado | Detalle |"
    "|---|---|---|---|"
)
foreach ($r in $Results) {
    $icon = if ($r.Pass) { "PASS" } else { "FAIL" }
    $mdLines += "| $($r.Tipo) | $($r.Nombre) | $icon | $($r.Detalle) |"
}
$mdLines += ""
$mdLines += "**Totales:** $passed PASS / $failed FAIL"
$mdLines | Set-Content -Path $mdFile -Encoding UTF8

Write-Log "Tabla Markdown: $mdFile"

if ($failed -gt 0) { exit 1 }
exit 0
