[CmdletBinding()]
param(
    [string]$Profile = "proxiai-deployment",
    [string]$Region = "ap-south-1",
    [string]$AccountId = "851725401338",
    [string]$ClusterName = "proxiai-production",
    [string]$FrontendServiceName = "proxiai-staging-frontend",
    [string]$ApiServiceName = "proxiai-staging-api",
    [string]$WorkerServiceName = "proxiai-staging-worker",
    [string]$PublicUrl = "https://proxiai.me"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "demo-power-common.ps1")

$identity = Assert-ProxiDeploymentIdentity -Profile $Profile -Region $Region -AccountId $AccountId
$backendServices = @($ApiServiceName, $WorkerServiceName)
foreach ($serviceName in $backendServices) {
    Set-ProxiServiceCount -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceName $serviceName -DesiredCount 1
}
Wait-ProxiServicesStable -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $backendServices | Out-Null

Set-ProxiServiceCount -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceName $FrontendServiceName -DesiredCount 1
$serviceNames = @($ApiServiceName, $WorkerServiceName, $FrontendServiceName)
$services = Wait-ProxiServicesStable -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames
$smoke = Test-ProxiPublicEndpoints -BaseUrl $PublicUrl
if (-not $smoke.Passed) {
    throw "Public ProxiAI smoke verification failed."
}

[pscustomobject]@{
    Mode = "SOFT_START"
    Principal = $identity.Arn
    Services = @($services | ForEach-Object {
        [pscustomobject]@{ Service = $_.serviceName; Desired = $_.desiredCount; Running = $_.runningCount }
    })
    Smoke = $smoke
    Result = "PASS"
}
