[CmdletBinding(SupportsShouldProcess)]
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
    [string]$StatePath = (Join-Path $PSScriptRoot ".runtime/demo-power-state.json"),
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "demo-power-common.ps1")

if (-not $Apply -and -not $WhatIfPreference) {
    throw "Use -WhatIf for a preview or -Apply for deep start."
}
if (-not (Test-Path -LiteralPath $StatePath)) {
    throw "Missing deep-stop recovery snapshot at $StatePath."
}

$identity = Assert-ProxiDeploymentIdentity -Profile $Profile -Region $Region -AccountId $AccountId
$state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
Assert-ProxiPowerState `
    -State $state `
    -AccountId $AccountId `
    -Region $Region `
    -ClusterName $ClusterName `
    -LoadBalancerName $LoadBalancerName `
    -FrontendServiceName $FrontendServiceName `
    -ApiServiceName $ApiServiceName `
    -WorkerServiceName $WorkerServiceName `
    -DomainName $DomainName | Out-Null

Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-vpcs", "--vpc-ids", $state.vpcId
) | Out-Null
$subnetArguments = @("ec2", "describe-subnets", "--subnet-ids") + @($state.publicSubnetIds) + @($state.privateSubnetIds)
Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $subnetArguments | Out-Null
$securityGroupArguments = @("ec2", "describe-security-groups", "--group-ids") + @($state.loadBalancer.securityGroupIds) + @($state.ecsSecurityGroupIds)
Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $securityGroupArguments | Out-Null
$targetGroupArguments = @(
    "elbv2", "describe-target-groups",
    "--target-group-arns"
) + @($state.targetGroups.frontendArn, $state.targetGroups.apiArn)
Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $targetGroupArguments | Out-Null
$certificateResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "acm", "describe-certificate", "--certificate-arn", $state.listeners.https.certificateArn
)
if ($certificateResult.Certificate.Status -ne "ISSUED") {
    throw "The preserved ACM certificate is not issued."
}
$addressResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-addresses", "--allocation-ids", $state.nat.eipAllocationId
)
if (@($addressResult.Addresses).Count -ne 1) {
    throw "The preserved NAT EIP allocation is unavailable."
}
$serviceNames = @($FrontendServiceName, $ApiServiceName, $WorkerServiceName)
Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames | Out-Null

if ($WhatIfPreference) {
    foreach ($resource in @(
        "NAT Gateway using $($state.nat.eipAllocationId)",
        "Private route table $($state.nat.privateRouteTableId)",
        "ALB $LoadBalancerName",
        "HTTP/HTTPS listeners and priorities 10/20",
        "Route 53 alias $DomainName",
        "ECS services $($serviceNames -join ', ')"
    )) {
        $PSCmdlet.ShouldProcess($resource, "Deep-start ProxiAI demo resource") | Out-Null
    }
    [pscustomobject]@{
        Mode = "DEEP_START_PREVIEW"
        Principal = $identity.Arn
        SnapshotPath = $StatePath
        Result = "PASS"
    }
    return
}

$natListResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-nat-gateways",
    "--filter", "Name=vpc-id,Values=$($state.vpcId)", "Name=state,Values=pending,available"
)
$matchingNatGateways = @($natListResult.NatGateways | Where-Object {
    $_.SubnetId -eq $state.nat.subnetId -and
    @($_.NatGatewayAddresses.AllocationId) -contains $state.nat.eipAllocationId
})
if ($matchingNatGateways.Count -gt 1) {
    throw "More than one NAT Gateway uses the preserved ProxiAI EIP."
}
if ($matchingNatGateways.Count -eq 1) {
    $natGatewayId = $matchingNatGateways[0].NatGatewayId
}
elseif ($PSCmdlet.ShouldProcess($state.nat.eipAllocationId, "Create ProxiAI NAT Gateway with preserved EIP")) {
    $natCreateResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ec2", "create-nat-gateway",
        "--subnet-id", $state.nat.subnetId,
        "--allocation-id", $state.nat.eipAllocationId,
        "--tag-specifications", "ResourceType=natgateway,Tags=[{Key=Name,Value=proxiai-nat},{Key=Project,Value=ProxiAI}]"
    )
    $natGatewayId = $natCreateResult.NatGateway.NatGatewayId
}
else {
    throw "NAT Gateway creation was not approved."
}
Wait-ProxiNatGatewayState -Profile $Profile -Region $Region -NatGatewayId $natGatewayId -ExpectedState "available" | Out-Null

$routeTableResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-route-tables", "--route-table-ids", $state.nat.privateRouteTableId
)
$defaultRoutes = @($routeTableResult.RouteTables[0].Routes | Where-Object DestinationCidrBlock -eq "0.0.0.0/0")
if ($defaultRoutes.Count -gt 1) {
    throw "Private default route discovery is ambiguous."
}
if ($defaultRoutes.Count -eq 0) {
    if ($PSCmdlet.ShouldProcess($state.nat.privateRouteTableId, "Create private default route to new NAT Gateway")) {
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "create-route",
            "--route-table-id", $state.nat.privateRouteTableId,
            "--destination-cidr-block", "0.0.0.0/0",
            "--nat-gateway-id", $natGatewayId
        ) | Out-Null
    }
}
elseif ($defaultRoutes[0].NatGatewayId -eq $natGatewayId -and $defaultRoutes[0].State -eq "active") {
    # Already restored.
}
elseif ($defaultRoutes[0].NatGatewayId -eq $state.nat.gatewayId -or $defaultRoutes[0].State -eq "blackhole") {
    if ($PSCmdlet.ShouldProcess($state.nat.privateRouteTableId, "Replace stale private default route")) {
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "replace-route",
            "--route-table-id", $state.nat.privateRouteTableId,
            "--destination-cidr-block", "0.0.0.0/0",
            "--nat-gateway-id", $natGatewayId
        ) | Out-Null
    }
}
else {
    throw "Refusing to replace a private default route owned by another gateway."
}

$loadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName -AllowMissing
if ($null -eq $loadBalancer) {
    if ($PSCmdlet.ShouldProcess($LoadBalancerName, "Create ProxiAI application load balancer")) {
        $loadBalancerArguments = @(
            "elbv2", "create-load-balancer",
            "--name", $LoadBalancerName,
            "--subnets"
        ) + @($state.loadBalancer.subnetIds) + @(
            "--security-groups"
        ) + @($state.loadBalancer.securityGroupIds) + @(
            "--scheme", $state.loadBalancer.scheme,
            "--type", $state.loadBalancer.type,
            "--ip-address-type", $state.loadBalancer.ipAddressType,
            "--tags", "Key=Name,Value=proxiai-alb", "Key=Project,Value=ProxiAI"
        )
        $loadBalancerResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $loadBalancerArguments
        $loadBalancer = @($loadBalancerResult.LoadBalancers)[0]
    }
}
else {
    $currentSubnets = @($loadBalancer.AvailabilityZones.SubnetId | Sort-Object)
    $expectedSubnets = @($state.loadBalancer.subnetIds | Sort-Object)
    $currentSecurityGroups = @($loadBalancer.SecurityGroups | Sort-Object)
    $expectedSecurityGroups = @($state.loadBalancer.securityGroupIds | Sort-Object)
    if (
        $loadBalancer.VpcId -ne $state.vpcId -or
        $loadBalancer.Scheme -ne $state.loadBalancer.scheme -or
        $loadBalancer.Type -ne $state.loadBalancer.type -or
        $loadBalancer.IpAddressType -ne $state.loadBalancer.ipAddressType -or
        (Compare-Object $currentSubnets $expectedSubnets) -or
        (Compare-Object $currentSecurityGroups $expectedSecurityGroups)
    ) {
        throw "Existing ALB does not match the verified ProxiAI snapshot."
    }
}
& aws elbv2 wait load-balancer-available `
    --load-balancer-arns $loadBalancer.LoadBalancerArn `
    --profile $Profile `
    --region $Region
if ($LASTEXITCODE -ne 0) {
    throw "ALB did not become available."
}
$loadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName

$httpActionsPath = Join-Path $env:TEMP "proxiai-http-actions-$([Guid]::NewGuid().ToString('N')).json"
$httpsActionsPath = Join-Path $env:TEMP "proxiai-https-actions-$([Guid]::NewGuid().ToString('N')).json"
try {
    Write-ProxiJsonFile -Path $httpActionsPath -Value @(
        [ordered]@{
            Type = "redirect"
            RedirectConfig = [ordered]@{ Protocol = "HTTPS"; Port = "443"; StatusCode = "HTTP_301" }
        }
    )
    Write-ProxiJsonFile -Path $httpsActionsPath -Value @(
        [ordered]@{ Type = "forward"; TargetGroupArn = $state.targetGroups.frontendArn }
    )

    $listenerResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-listeners", "--load-balancer-arn", $loadBalancer.LoadBalancerArn
    )
    $listeners = @($listenerResult.Listeners)
    $httpListeners = @($listeners | Where-Object { $_.Protocol -eq "HTTP" -and $_.Port -eq 80 })
    $httpsListeners = @($listeners | Where-Object { $_.Protocol -eq "HTTPS" -and $_.Port -eq 443 })
    if ($httpListeners.Count -gt 1 -or $httpsListeners.Count -gt 1) {
        throw "Listener discovery is ambiguous."
    }

    if ($httpListeners.Count -eq 0) {
        $httpResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "create-listener",
            "--load-balancer-arn", $loadBalancer.LoadBalancerArn,
            "--protocol", "HTTP",
            "--port", "80",
            "--default-actions", "file://$httpActionsPath"
        )
        $httpListener = @($httpResult.Listeners)[0]
    }
    else {
        $httpListener = $httpListeners[0]
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "modify-listener",
            "--listener-arn", $httpListener.ListenerArn,
            "--default-actions", "file://$httpActionsPath"
        ) | Out-Null
    }

    if ($httpsListeners.Count -eq 0) {
        $httpsResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "create-listener",
            "--load-balancer-arn", $loadBalancer.LoadBalancerArn,
            "--protocol", "HTTPS",
            "--port", "443",
            "--ssl-policy", $state.listeners.https.sslPolicy,
            "--certificates", "CertificateArn=$($state.listeners.https.certificateArn)",
            "--default-actions", "file://$httpsActionsPath"
        )
        $httpsListener = @($httpsResult.Listeners)[0]
    }
    else {
        $httpsListener = $httpsListeners[0]
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "modify-listener",
            "--listener-arn", $httpsListener.ListenerArn,
            "--ssl-policy", $state.listeners.https.sslPolicy,
            "--certificates", "CertificateArn=$($state.listeners.https.certificateArn)",
            "--default-actions", "file://$httpsActionsPath"
        ) | Out-Null
    }

    $existingRuleResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-rules", "--listener-arn", $httpsListener.ListenerArn
    )
    $existingRules = @($existingRuleResult.Rules | Where-Object { -not $_.IsDefault })
    if (@($existingRules | Where-Object { [int]$_.Priority -notin @(10, 20) }).Count -gt 0) {
        throw "Refusing to overwrite unexpected ALB listener rules."
    }

    foreach ($rule in @($state.listeners.rules)) {
        $conditionPath = Join-Path $env:TEMP "proxiai-rule-condition-$([Guid]::NewGuid().ToString('N')).json"
        $actionPath = Join-Path $env:TEMP "proxiai-rule-action-$([Guid]::NewGuid().ToString('N')).json"
        try {
            Write-ProxiJsonFile -Path $conditionPath -Value @(
                [ordered]@{ Field = "path-pattern"; Values = @($rule.pathPattern) }
            )
            Write-ProxiJsonFile -Path $actionPath -Value @(
                [ordered]@{ Type = "forward"; TargetGroupArn = $rule.targetGroupArn }
            )
            $priorityMatches = @($existingRules | Where-Object Priority -eq "$($rule.priority)")
            if ($priorityMatches.Count -eq 0) {
                Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
                    "elbv2", "create-rule",
                    "--listener-arn", $httpsListener.ListenerArn,
                    "--priority", $rule.priority,
                    "--conditions", "file://$conditionPath",
                    "--actions", "file://$actionPath"
                ) | Out-Null
            }
            elseif ($priorityMatches.Count -eq 1) {
                Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
                    "elbv2", "modify-rule",
                    "--rule-arn", $priorityMatches[0].RuleArn,
                    "--conditions", "file://$conditionPath",
                    "--actions", "file://$actionPath"
                ) | Out-Null
            }
            else {
                throw "Listener-rule priority discovery is ambiguous."
            }
        }
        finally {
            Remove-Item -LiteralPath $conditionPath, $actionPath -ErrorAction SilentlyContinue
        }
    }
}
finally {
    Remove-Item -LiteralPath $httpActionsPath, $httpsActionsPath -ErrorAction SilentlyContinue
}

$route53Changes = @()
foreach ($record in @($state.route53.records)) {
    if ($record.Type -eq "AAAA" -and $loadBalancer.IpAddressType -ne "dualstack") {
        throw "Cannot restore an AAAA alias to an IPv4-only ALB."
    }
    $restoredRecord = [ordered]@{
        Name = $record.Name
        Type = $record.Type
        AliasTarget = [ordered]@{
            HostedZoneId = $loadBalancer.CanonicalHostedZoneId
            DNSName = "dualstack.$($loadBalancer.DNSName)."
            EvaluateTargetHealth = [bool]$record.AliasTarget.EvaluateTargetHealth
        }
    }
    if ($PSCmdlet.ShouldProcess("$($record.Name) $($record.Type)", "Restore ProxiAI Route 53 alias")) {
        $change = Invoke-ProxiRoute53Change `
            -Profile $Profile `
            -Region $Region `
            -HostedZoneId $state.route53.hostedZoneId `
            -Action "UPSERT" `
            -ResourceRecordSet $restoredRecord
        $route53Changes += $change.ChangeInfo.Id
    }
}
foreach ($changeId in $route53Changes) {
    & aws route53 wait resource-record-sets-changed `
        --id $changeId `
        --profile $Profile `
        --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw "Route 53 change did not reach INSYNC."
    }
}

& (Join-Path $PSScriptRoot "soft-start-demo.ps1") `
    -Profile $Profile `
    -Region $Region `
    -AccountId $AccountId `
    -ClusterName $ClusterName `
    -FrontendServiceName $FrontendServiceName `
    -ApiServiceName $ApiServiceName `
    -WorkerServiceName $WorkerServiceName `
    -PublicUrl "https://$DomainName" `
    -PublicSmokeMaximumAttempts 90 | Out-Null

$frontendHealth = Get-ProxiTargetHealthSummary -Profile $Profile -Region $Region -TargetGroupArn $state.targetGroups.frontendArn
$apiHealth = Get-ProxiTargetHealthSummary -Profile $Profile -Region $Region -TargetGroupArn $state.targetGroups.apiArn
if (@($frontendHealth | Where-Object State -eq "healthy").Count -lt 1 -or @($apiHealth | Where-Object State -eq "healthy").Count -lt 1) {
    throw "ALB target health verification failed."
}
$services = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames
$smoke = Test-ProxiPublicEndpoints -BaseUrl "https://$DomainName"
if (-not $smoke.Passed) {
    $summary = Get-ProxiPublicSmokeSummary -Smoke $smoke
    throw "Public ProxiAI smoke verification failed after deep start. $summary"
}

[pscustomobject]@{
    Mode = "DEEP_START"
    Principal = $identity.Arn
    NatGatewayId = $natGatewayId
    LoadBalancerArn = $loadBalancer.LoadBalancerArn
    LoadBalancerDns = $loadBalancer.DNSName
    Services = @($services | ForEach-Object {
        [pscustomobject]@{ Service = $_.serviceName; Desired = $_.desiredCount; Running = $_.runningCount }
    })
    FrontendTargetHealth = $frontendHealth
    ApiTargetHealth = $apiHealth
    PublicSmoke = $smoke
    Result = "PASS"
}
