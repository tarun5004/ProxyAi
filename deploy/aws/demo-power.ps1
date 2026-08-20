[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet("snapshot", "soft-stop", "soft-start", "deep-stop", "deep-start")]
    [string]$Action,
    [Alias("Profile")]
    [string]$AwsProfile = "proxiai-deployment",
    [string]$Region = "ap-south-1",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$scriptName = switch ($Action) {
    "snapshot" { "snapshot-demo-power.ps1" }
    "soft-stop" { "soft-stop-demo.ps1" }
    "soft-start" { "soft-start-demo.ps1" }
    "deep-stop" { "deep-stop-demo.ps1" }
    "deep-start" { "deep-start-demo.ps1" }
}
$parameters = @{
    Profile = $AwsProfile
    Region = $Region
}
if ($Action -in @("deep-stop", "deep-start")) {
    if ($Apply) {
        $parameters.Apply = $true
    }
    elseif ($WhatIfPreference) {
        $parameters.WhatIf = $true
    }
    else {
        throw "Use -WhatIf for a deep preview or -Apply for a deep operation."
    }
}

& (Join-Path $PSScriptRoot $scriptName) @parameters
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
