[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Profile = "proxiai-deployment",
    [string]$Region = "ap-south-1",
    [string]$AccountId = "851725401338",
    [string]$InstanceName = "proxiai-demo",
    [string]$StaticIpName = "proxiai-demo-ip",
    [string]$AvailabilityZone = "ap-south-1a",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bootstrapPath = Join-Path $scriptRoot "bootstrap.sh"

function Invoke-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $output = & aws @Arguments --profile $Profile --region $Region --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }

    return ($output -join [Environment]::NewLine) | ConvertFrom-Json
}

$identity = Invoke-AwsJson -Arguments @("sts", "get-caller-identity")
if ($identity.Account -ne $AccountId) {
    throw "Refusing unexpected AWS account."
}
if ($identity.Arn -match ":root$") {
    throw "Root AWS identity is prohibited."
}
if (-not (Test-Path -LiteralPath $bootstrapPath)) {
    throw "Missing bootstrap.sh."
}

$bundles = Invoke-AwsJson -Arguments @("lightsail", "get-bundles")
$bundle = $bundles.bundles |
    Where-Object {
        $_.isActive -eq $true -and
        $_.ramSizeInGb -eq 2 -and
        $_.supportedPlatforms -contains "LINUX_UNIX" -and
        $_.publicIpv4AddressCount -ge 1
    } |
    Sort-Object price |
    Select-Object -First 1
if ($null -eq $bundle) {
    throw "No active 2 GB Linux Lightsail bundle with public IPv4 is available."
}

$blueprints = Invoke-AwsJson -Arguments @("lightsail", "get-blueprints")
$blueprint = $blueprints.blueprints |
    Where-Object {
        $_.isActive -eq $true -and
        $_.platform -eq "LINUX_UNIX" -and
        $_.group -match "^ubuntu_24"
    } |
    Sort-Object version -Descending |
    Select-Object -First 1
if ($null -eq $blueprint) {
    throw "No active Ubuntu 24 Lightsail blueprint is available."
}

$instances = Invoke-AwsJson -Arguments @("lightsail", "get-instances")
$instance = $instances.instances | Where-Object name -eq $InstanceName
if ($null -eq $instance) {
    if (-not $Apply) {
        [pscustomobject]@{
            Mode = "CHECK"
            Required = "Create 2 GB Lightsail instance"
            Instance = $InstanceName
            Bundle = $bundle.bundleId
            Blueprint = $blueprint.blueprintId
        }
        return
    }
    if ($PSCmdlet.ShouldProcess($InstanceName, "Create 2 GB Lightsail instance")) {
        $userData = Get-Content -Raw -LiteralPath $bootstrapPath
        Invoke-AwsJson -Arguments @(
            "lightsail", "create-instances",
            "--instance-names", $InstanceName,
            "--availability-zone", $AvailabilityZone,
            "--blueprint-id", $blueprint.blueprintId,
            "--bundle-id", $bundle.bundleId,
            "--ip-address-type", "dualstack",
            "--user-data", $userData,
            "--tags",
            "key=Project,value=ProxiAI",
            "key=Environment,value=production",
            "key=ManagedBy,value=Codex"
        ) | Out-Null
    }

    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 5
        $state = Invoke-AwsJson -Arguments @(
            "lightsail", "get-instance-state", "--instance-name", $InstanceName
        )
        if ($state.state.name -eq "running") {
            break
        }
        if ($attempt -eq 59) {
            throw "Lightsail instance did not reach running state."
        }
    }
}

$staticIps = Invoke-AwsJson -Arguments @("lightsail", "get-static-ips")
$staticIp = $staticIps.staticIps | Where-Object name -eq $StaticIpName
if ($null -eq $staticIp) {
    if (-not $Apply) {
        [pscustomobject]@{
            Mode = "CHECK"
            Required = "Allocate and attach Lightsail static IP"
            Instance = $InstanceName
            StaticIpName = $StaticIpName
        }
        return
    }
    if ($PSCmdlet.ShouldProcess($StaticIpName, "Allocate Lightsail static IP")) {
        Invoke-AwsJson -Arguments @(
            "lightsail", "allocate-static-ip", "--static-ip-name", $StaticIpName
        ) | Out-Null
        $staticIp = Invoke-AwsJson -Arguments @(
            "lightsail", "get-static-ip", "--static-ip-name", $StaticIpName
        )
        $staticIp = $staticIp.staticIp
    }
}

if ($staticIp.attachedTo -and $staticIp.attachedTo -ne $InstanceName) {
    throw "Static IP is already attached to another instance."
}
if (-not $staticIp.attachedTo -and -not $Apply) {
    [pscustomobject]@{
        Mode = "CHECK"
        Required = "Attach existing static IP"
        Instance = $InstanceName
        StaticIpName = $StaticIpName
    }
    return
}
if (-not $staticIp.attachedTo -and $Apply -and $PSCmdlet.ShouldProcess($InstanceName, "Attach static IP")) {
    Invoke-AwsJson -Arguments @(
        "lightsail", "attach-static-ip",
        "--static-ip-name", $StaticIpName,
        "--instance-name", $InstanceName
    ) | Out-Null
}

$portConfigPath = Join-Path $env:TEMP "proxiai-lightsail-ports.json"
try {
    @(
        @{ fromPort = 80; toPort = 80; protocol = "tcp"; cidrs = @("0.0.0.0/0"); ipv6Cidrs = @("::/0") },
        @{ fromPort = 443; toPort = 443; protocol = "tcp"; cidrs = @("0.0.0.0/0"); ipv6Cidrs = @("::/0") },
        @{ fromPort = 443; toPort = 443; protocol = "udp"; cidrs = @("0.0.0.0/0"); ipv6Cidrs = @("::/0") }
    ) | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $portConfigPath -Encoding utf8NoBOM

    if ($Apply -and $PSCmdlet.ShouldProcess($InstanceName, "Restrict public ports to HTTP/HTTPS")) {
        Invoke-AwsJson -Arguments @(
            "lightsail", "put-instance-public-ports",
            "--instance-name", $InstanceName,
            "--port-infos", "file://$portConfigPath"
        ) | Out-Null
    }
}
finally {
    Remove-Item -LiteralPath $portConfigPath -ErrorAction SilentlyContinue
}

$verified = Invoke-AwsJson -Arguments @(
    "lightsail", "get-instance", "--instance-name", $InstanceName
)
$verifiedIp = Invoke-AwsJson -Arguments @(
    "lightsail", "get-static-ip", "--static-ip-name", $StaticIpName
)

[pscustomobject]@{
    Instance = $verified.instance.name
    State = $verified.instance.state.name
    Bundle = $verified.instance.bundleId
    StaticIp = $verifiedIp.staticIp.ipAddress
    Attached = $verifiedIp.staticIp.attachedTo
}
