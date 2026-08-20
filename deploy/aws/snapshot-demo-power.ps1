[CmdletBinding()]
param(
    [string]$Profile = "proxiai-deployment",
    [string]$Region = "ap-south-1",
    [string]$AccountId = "851725401338",
    [string]$ClusterName = "proxiai-production",
    [string]$LoadBalancerName = "proxiai-alb",
    [string]$FrontendServiceName = "proxiai-staging-frontend",
    [string]$ApiServiceName = "proxiai-staging-api",
    [string]$WorkerServiceName = "proxiai-staging-worker",
    [string]$DomainName = "proxiai.me",
    [string]$StatePath = (Join-Path $PSScriptRoot ".runtime/demo-power-state.json")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "demo-power-common.ps1")

$state = Get-ProxiPowerState `
    -Profile $Profile `
    -Region $Region `
    -AccountId $AccountId `
    -ClusterName $ClusterName `
    -LoadBalancerName $LoadBalancerName `
    -FrontendServiceName $FrontendServiceName `
    -ApiServiceName $ApiServiceName `
    -WorkerServiceName $WorkerServiceName `
    -DomainName $DomainName

$candidateState = ConvertTo-Json -InputObject $state -Depth 30 | ConvertFrom-Json
Assert-ProxiPowerState `
    -State $candidateState `
    -AccountId $AccountId `
    -Region $Region `
    -ClusterName $ClusterName `
    -LoadBalancerName $LoadBalancerName `
    -FrontendServiceName $FrontendServiceName `
    -ApiServiceName $ApiServiceName `
    -WorkerServiceName $WorkerServiceName `
    -DomainName $DomainName | Out-Null

$candidatePath = "$StatePath.candidate-$([Guid]::NewGuid().ToString('N'))"
$stateReplaced = $false
try {
    Write-ProxiJsonFile -Value $candidateState -Path $candidatePath
    $persistedCandidate = Get-Content -Raw -LiteralPath $candidatePath | ConvertFrom-Json
    Assert-ProxiPowerState `
        -State $persistedCandidate `
        -AccountId $AccountId `
        -Region $Region `
        -ClusterName $ClusterName `
        -LoadBalancerName $LoadBalancerName `
        -FrontendServiceName $FrontendServiceName `
        -ApiServiceName $ApiServiceName `
        -WorkerServiceName $WorkerServiceName `
        -DomainName $DomainName | Out-Null

    Move-Item -LiteralPath $candidatePath -Destination $StatePath -Force
    $stateReplaced = $true
    $persistedState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
    Assert-ProxiPowerState `
        -State $persistedState `
        -AccountId $AccountId `
        -Region $Region `
        -ClusterName $ClusterName `
        -LoadBalancerName $LoadBalancerName `
        -FrontendServiceName $FrontendServiceName `
        -ApiServiceName $ApiServiceName `
        -WorkerServiceName $WorkerServiceName `
        -DomainName $DomainName | Out-Null
}
catch {
    if ($stateReplaced) {
        Remove-Item -LiteralPath $StatePath -ErrorAction SilentlyContinue
    }
    throw
}
finally {
    Remove-Item -LiteralPath $candidatePath -ErrorAction SilentlyContinue
}

[pscustomobject]@{
    Mode = "SNAPSHOT"
    SnapshotPath = $StatePath
    CapturedAt = $persistedState.capturedAt
    Validated = $true
    AwsMutations = 0
}
