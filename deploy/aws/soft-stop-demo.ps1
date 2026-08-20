[CmdletBinding()]
param(
    [string]$Profile = "proxiai-deployment",
    [string]$Region = "ap-south-1",
    [string]$AccountId = "851725401338",
    [string]$ClusterName = "proxiai-production",
    [string]$FrontendServiceName = "proxiai-staging-frontend",
    [string]$ApiServiceName = "proxiai-staging-api",
    [string]$WorkerServiceName = "proxiai-staging-worker"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "demo-power-common.ps1")

$identity = Assert-ProxiDeploymentIdentity -Profile $Profile -Region $Region -AccountId $AccountId
$serviceNames = @($FrontendServiceName, $ApiServiceName, $WorkerServiceName)
$before = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames

foreach ($serviceName in $serviceNames) {
    Set-ProxiServiceCount -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceName $serviceName -DesiredCount 0
}
$after = Wait-ProxiServiceCounts -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames -ExpectedCount 0

[pscustomobject]@{
    Mode = "SOFT_STOP"
    Principal = $identity.Arn
    Before = @($before | ForEach-Object {
        [pscustomobject]@{ Service = $_.serviceName; Desired = $_.desiredCount; Running = $_.runningCount }
    })
    After = @($after | ForEach-Object {
        [pscustomobject]@{ Service = $_.serviceName; Desired = $_.desiredCount; Running = $_.runningCount }
    })
}
