$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "../demo-power-common.ps1")

function Assert-Equal {
    param(
        [Parameter(Mandatory)]
        [object]$Actual,
        [Parameter(Mandatory)]
        [object]$Expected,
        [Parameter(Mandatory)]
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', received '$Actual'."
    }
}

$script:serviceReadCount = 0
function Get-ProxiServices {
    $script:serviceReadCount++
    $ready = $script:serviceReadCount -ne 2
    return @([pscustomobject]@{
        desiredCount = 1
        runningCount = if ($ready) { 1 } else { 0 }
        pendingCount = if ($ready) { 0 } else { 1 }
    })
}

function Start-Sleep {}

$serviceResult = Wait-ProxiServiceCounts `
    -Profile test `
    -Region test `
    -ClusterName test `
    -ServiceNames @("worker") `
    -ExpectedCount 1 `
    -MaximumAttempts 5 `
    -ConsecutiveReadyChecks 3 `
    -PollIntervalSeconds 0
Assert-Equal @($serviceResult).Count 1 "Service gate should return the ready service."
Assert-Equal $script:serviceReadCount 5 "Service gate must reset after an unstable poll."

$script:webRequestCount = 0
function Invoke-WebRequest {
    $script:webRequestCount++
    if ($script:webRequestCount -le 3) {
        throw "Transient endpoint failure."
    }
    return [pscustomobject]@{ StatusCode = 200 }
}

$retryResult = Test-ProxiPublicEndpoints `
    -BaseUrl "https://example.invalid" `
    -MaximumAttempts 2 `
    -RetryDelaySeconds 0
Assert-Equal $retryResult.Passed $true "Public smoke should recover after a transient attempt."
Assert-Equal $retryResult.Attempts 2 "Public smoke should report the successful attempt count."

function Invoke-WebRequest { throw "Persistent endpoint failure." }

$failureResult = Test-ProxiPublicEndpoints `
    -BaseUrl "https://example.invalid" `
    -MaximumAttempts 2 `
    -RetryDelaySeconds 0
Assert-Equal $failureResult.Passed $false "Public smoke must fail after bounded retries."
Assert-Equal $failureResult.Attempts 2 "Public smoke must remain bounded."
Assert-Equal $failureResult.Checks["/health/ready"] "FAIL" "Failure metadata must stay safe."
$failureSummary = Get-ProxiPublicSmokeSummary -Smoke $failureResult
Assert-Equal `
    $failureSummary `
    "attempts=2; /=FAIL, /health/live=FAIL, /health/ready=FAIL" `
    "Public smoke failure summary must be safe and actionable."

Write-Output "PASS demo power readiness helpers"
