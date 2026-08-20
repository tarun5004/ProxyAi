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
    throw "Use -WhatIf for a preview or -Apply for deep stop."
}

$identity = Assert-ProxiDeploymentIdentity -Profile $Profile -Region $Region -AccountId $AccountId
$currentLoadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName -AllowMissing
if ($null -ne $currentLoadBalancer) {
    if ($WhatIfPreference) {
        $previewState = Get-ProxiPowerState `
            -Profile $Profile `
            -Region $Region `
            -AccountId $AccountId `
            -ClusterName $ClusterName `
            -LoadBalancerName $LoadBalancerName `
            -FrontendServiceName $FrontendServiceName `
            -ApiServiceName $ApiServiceName `
            -WorkerServiceName $WorkerServiceName `
            -DomainName $DomainName
        $state = ConvertTo-Json -InputObject $previewState -Depth 30 | ConvertFrom-Json
    }
    else {
        & (Join-Path $PSScriptRoot "snapshot-demo-power.ps1") `
            -Profile $Profile `
            -Region $Region `
            -AccountId $AccountId `
            -ClusterName $ClusterName `
            -LoadBalancerName $LoadBalancerName `
            -FrontendServiceName $FrontendServiceName `
            -ApiServiceName $ApiServiceName `
            -WorkerServiceName $WorkerServiceName `
            -DomainName $DomainName `
            -StatePath $StatePath | Out-Null
        if (-not (Test-Path -LiteralPath $StatePath)) {
            throw "Validated recovery snapshot was not created."
        }
        $state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
    }
}
elseif (Test-Path -LiteralPath $StatePath) {
    $state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
}
else {
    throw "ALB is absent and no validated recovery snapshot exists."
}

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

$serviceNames = @($FrontendServiceName, $ApiServiceName, $WorkerServiceName)
if ($PSCmdlet.ShouldProcess(($serviceNames -join ", "), "Scale ProxiAI ECS services to zero")) {
    & (Join-Path $PSScriptRoot "soft-stop-demo.ps1") `
        -Profile $Profile `
        -Region $Region `
        -AccountId $AccountId `
        -ClusterName $ClusterName `
        -FrontendServiceName $FrontendServiceName `
        -ApiServiceName $ApiServiceName `
        -WorkerServiceName $WorkerServiceName | Out-Null
}

if ($WhatIfPreference) {
    foreach ($resource in @(
        "ALB listeners and rules for $LoadBalancerName",
        "ALB $LoadBalancerName",
        "NAT default route in $($state.nat.privateRouteTableId)",
        "NAT Gateway $($state.nat.gatewayId)",
        "Route 53 alias $DomainName"
    )) {
        $PSCmdlet.ShouldProcess($resource, "Deep-stop ProxiAI demo resource") | Out-Null
    }
    [pscustomobject]@{
        Mode = "DEEP_STOP_PREVIEW"
        Principal = $identity.Arn
        SnapshotPath = $StatePath
        Preserved = @("ECS services", "ECS cluster", "task definitions", "target groups", "ACM", "Route 53 hosted zone", "NAT EIP", "ECR", "IAM", "Secrets Manager", "VPC", "subnets", "security groups")
    }
    return
}

$runningTaskArns = @()
foreach ($serviceName in $serviceNames) {
    $taskResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ecs", "list-tasks",
        "--cluster", $ClusterName,
        "--service-name", $serviceName,
        "--desired-status", "RUNNING"
    )
    $runningTaskArns += @($taskResult.taskArns)
}
if ($runningTaskArns.Count -ne 0) {
    throw "Refusing deep stop while ProxiAI ECS tasks are still running."
}

$loadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName -AllowMissing
if ($null -ne $loadBalancer) {
    if ($loadBalancer.LoadBalancerArn -ne $state.loadBalancer.arn -or $loadBalancer.VpcId -ne $state.vpcId) {
        throw "Current ALB no longer matches the verified ProxiAI snapshot."
    }
    $listenerResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-listeners", "--load-balancer-arn", $loadBalancer.LoadBalancerArn
    )
    foreach ($listener in @($listenerResult.Listeners)) {
        $ruleResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "describe-rules", "--listener-arn", $listener.ListenerArn
        )
        foreach ($rule in @($ruleResult.Rules | Where-Object { -not $_.IsDefault })) {
            if ($PSCmdlet.ShouldProcess($rule.RuleArn, "Delete verified ProxiAI listener rule")) {
                Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
                    "elbv2", "delete-rule", "--rule-arn", $rule.RuleArn
                ) | Out-Null
            }
        }
        if ($PSCmdlet.ShouldProcess($listener.ListenerArn, "Delete verified ProxiAI listener")) {
            Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
                "elbv2", "delete-listener", "--listener-arn", $listener.ListenerArn
            ) | Out-Null
        }
    }
    if ($PSCmdlet.ShouldProcess($loadBalancer.LoadBalancerArn, "Delete verified ProxiAI ALB")) {
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "elbv2", "delete-load-balancer", "--load-balancer-arn", $loadBalancer.LoadBalancerArn
        ) | Out-Null
        & aws elbv2 wait load-balancers-deleted `
            --load-balancer-arns $loadBalancer.LoadBalancerArn `
            --profile $Profile `
            --region $Region
        if ($LASTEXITCODE -ne 0) {
            throw "ALB deletion did not complete."
        }
    }
}

$routeTableResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-route-tables", "--route-table-ids", $state.nat.privateRouteTableId
)
$defaultRoutes = @($routeTableResult.RouteTables[0].Routes | Where-Object DestinationCidrBlock -eq "0.0.0.0/0")
if ($defaultRoutes.Count -gt 1) {
    throw "Private default route discovery is ambiguous."
}
if ($defaultRoutes.Count -eq 1) {
    if ($defaultRoutes[0].NatGatewayId -ne $state.nat.gatewayId) {
        throw "Refusing to delete a default route that no longer targets the snapshotted NAT Gateway."
    }
    if ($PSCmdlet.ShouldProcess($state.nat.privateRouteTableId, "Delete private NAT default route")) {
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "delete-route",
            "--route-table-id", $state.nat.privateRouteTableId,
            "--destination-cidr-block", "0.0.0.0/0"
        ) | Out-Null
    }
}

$natResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-nat-gateways", "--nat-gateway-ids", $state.nat.gatewayId
)
$natGateway = @($natResult.NatGateways)[0]
if ($natGateway.State -notin @("deleted", "deleting")) {
    if ($natGateway.VpcId -ne $state.vpcId -or $natGateway.SubnetId -ne $state.nat.subnetId) {
        throw "Current NAT Gateway no longer matches the verified ProxiAI snapshot."
    }
    if (@($natGateway.NatGatewayAddresses.AllocationId) -notcontains $state.nat.eipAllocationId) {
        throw "Current NAT Gateway does not use the preserved ProxiAI EIP."
    }
    if ($PSCmdlet.ShouldProcess($state.nat.gatewayId, "Delete verified ProxiAI NAT Gateway")) {
        Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "delete-nat-gateway", "--nat-gateway-id", $state.nat.gatewayId
        ) | Out-Null
    }
}
Wait-ProxiNatGatewayState -Profile $Profile -Region $Region -NatGatewayId $state.nat.gatewayId -ExpectedState "deleted" | Out-Null

foreach ($record in @($state.route53.records)) {
    $expectedDnsNames = @("$($state.loadBalancer.dnsName).", "dualstack.$($state.loadBalancer.dnsName).")
    if ($record.AliasTarget.DNSName -notin $expectedDnsNames) {
        throw "Refusing to remove a Route 53 record that does not target the snapshotted ALB."
    }
    $currentRecordResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "route53", "list-resource-record-sets", "--hosted-zone-id", $state.route53.hostedZoneId
    )
    $currentMatches = @($currentRecordResult.ResourceRecordSets | Where-Object {
        $_.Name -eq $record.Name -and $_.Type -eq $record.Type
    })
    if ($currentMatches.Count -gt 1) {
        throw "Route 53 record discovery is ambiguous."
    }
    if ($currentMatches.Count -eq 1 -and $currentMatches[0].AliasTarget.DNSName -ne $record.AliasTarget.DNSName) {
        throw "Refusing to remove a Route 53 record that now targets another resource."
    }
    if ($currentMatches.Count -eq 1 -and $PSCmdlet.ShouldProcess("$($record.Name) $($record.Type)", "Delete dangling ProxiAI ALB alias")) {
        Invoke-ProxiRoute53Change `
            -Profile $Profile `
            -Region $Region `
            -HostedZoneId $state.route53.hostedZoneId `
            -Action "DELETE" `
            -ResourceRecordSet $record | Out-Null
    }
}

$remainingLoadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName -AllowMissing
$eipResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "ec2", "describe-addresses", "--allocation-ids", $state.nat.eipAllocationId
)
$targetGroupArguments = @(
    "elbv2", "describe-target-groups",
    "--target-group-arns"
) + @($state.targetGroups.frontendArn, $state.targetGroups.apiArn)
Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $targetGroupArguments | Out-Null
Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
    "acm", "describe-certificate", "--certificate-arn", $state.listeners.https.certificateArn
) | Out-Null

[pscustomobject]@{
    Mode = "DEEP_STOP"
    Principal = $identity.Arn
    SnapshotPath = $StatePath
    EcsRunningTasks = 0
    LoadBalancerAbsent = $null -eq $remainingLoadBalancer
    NatGatewayState = "deleted"
    EipPreserved = @($eipResult.Addresses).Count -eq 1
    TargetGroupsPreserved = $true
    AcmCertificatePreserved = $true
    Result = "PASS"
}
