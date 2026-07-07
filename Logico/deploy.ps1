# =====================================================================
# LogiCo - Script de deploy completo (PowerShell)
#
# Uso:
#   .\deploy.ps1            # despliega functions + hosting + reattach SQL
#   .\deploy.ps1 hosting    # solo hosting
#   .\deploy.ps1 functions  # solo functions (incluye reattach SQL)
#
# Razón: firebase deploy --only functions sobreescribe la configuración
# de Cloud Run y desconecta Cloud SQL. Este script lo vuelve a adjuntar.
# =====================================================================

param(
    [string]$Target = "all"
)

# Firebase/Cloud Run/Hosting/Auth viven en este proyecto:
$Project = "logico-app"
$Region = "us-central1"
# Cloud SQL vive en OTRO proyecto (cross-project):
$SqlProject = "logico-498613"
$SqlInstance = "free-trial-first-project"
$ConnectionName = "${SqlProject}:${Region}:${SqlInstance}"

function Find-Gcloud {
    # 1) Si está en PATH, devolverlo tal cual.
    $cmd = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    # 2) Probar rutas estándar de instalación de Google Cloud SDK en Windows.
    $candidates = @(
        "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:ProgramFiles\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "${env:ProgramFiles(x86)}\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        "$env:USERPROFILE\google-cloud-sdk\bin\gcloud.cmd"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Show-ManualReattachInstructions {
    Write-Host ""
    Write-Host "No se encontró gcloud CLI. Tu Cloud SQL puede haber quedado" -ForegroundColor Yellow
    Write-Host "desconectado del servicio Cloud Run 'api'. Reconéctalo con UNA de estas opciones:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  A) Instalar gcloud (recomendado):" -ForegroundColor Cyan
    Write-Host "       winget install -e --id Google.CloudSDK"
    Write-Host "     Cierra y reabre PowerShell, luego:"
    Write-Host "       gcloud auth login"
    Write-Host "       gcloud config set project $Project"
    Write-Host "       .\deploy.ps1 functions"
    Write-Host ""
    Write-Host "  B) Hacerlo manualmente en la consola web:" -ForegroundColor Cyan
    Write-Host "       https://console.cloud.google.com/run/detail/$Region/api/connections?project=$Project"
    Write-Host "     Editar y desplegar nueva revisión > Conexiones > Cloud SQL >"
    Write-Host "       añadir '$ConnectionName' > Desplegar"
    Write-Host ""
}

function Reattach-CloudSQL {
    Write-Host "`n--- Re-adjuntando Cloud SQL al servicio Cloud Run 'api' ---" -ForegroundColor Cyan

    $gcloud = Find-Gcloud
    if (-not $gcloud) {
        Write-Host "gcloud no está instalado o no está en PATH." -ForegroundColor Red
        Show-ManualReattachInstructions
        exit 1
    }

    & $gcloud run services update api `
        --region=$Region `
        --add-cloudsql-instances=$ConnectionName `
        --project=$Project
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR al re-adjuntar Cloud SQL." -ForegroundColor Red
        exit 1
    }
    Write-Host "Cloud SQL re-adjuntado OK." -ForegroundColor Green
}

switch ($Target) {
    "hosting" {
        firebase deploy --only hosting
    }
    "functions" {
        firebase deploy --only functions
        if ($LASTEXITCODE -eq 0) { Reattach-CloudSQL }
    }
    default {
        firebase deploy --only functions
        if ($LASTEXITCODE -eq 0) { Reattach-CloudSQL }
        firebase deploy --only hosting
    }
}

Write-Host "`n=== Deploy completado ===" -ForegroundColor Green
Write-Host "Smoke test:" -ForegroundColor Yellow
Write-Host "  curl https://logico-app.web.app/api/health" -ForegroundColor Yellow
