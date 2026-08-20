Set-StrictMode -Version Latest

function Invoke-ProxiAwsJson {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $output = & aws @Arguments --profile $Profile --region $Region --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }

    $json = ($output -join [Environment]::NewLine).Trim()
    if (-not $json) {
        return $null
    }

    return $json | ConvertFrom-Json
}

function Assert-ProxiDeploymentIdentity {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$AccountId
    )

    $identity = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "sts", "get-caller-identity"
    )
    if ($identity.Account -ne $AccountId) {
        throw "Refusing unexpected AWS account $($identity.Account)."
    }
    if ($identity.Arn -match ":root$") {
        throw "Root AWS identity is prohibited."
    }

    return $identity
}

function Get-ProxiServices {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$ClusterName,
        [Parameter(Mandatory)]
        [string[]]$ServiceNames
    )

    $arguments = @(
        "ecs", "describe-services",
        "--cluster", $ClusterName,
        "--services"
    ) + $ServiceNames
    $result = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $arguments
    if (@($result.failures).Count -gt 0) {
        throw "One or more required ECS services could not be discovered."
    }

    $services = @($result.services)
    if ($services.Count -ne $ServiceNames.Count) {
        throw "Expected $($ServiceNames.Count) ECS services, found $($services.Count)."
    }
    foreach ($serviceName in $ServiceNames) {
        if (@($services | Where-Object serviceName -eq $serviceName).Count -ne 1) {
            throw "ECS service discovery is ambiguous for $serviceName."
        }
    }

    return $services
}

function Set-ProxiServiceCount {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$ClusterName,
        [Parameter(Mandatory)]
        [string]$ServiceName,
        [Parameter(Mandatory)]
        [ValidateRange(0, 1)]
        [int]$DesiredCount
    )

    $services = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames @($ServiceName)
    if ($services[0].desiredCount -eq $DesiredCount) {
        return
    }

    Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ecs", "update-service",
        "--cluster", $ClusterName,
        "--service", $ServiceName,
        "--desired-count", $DesiredCount
    ) | Out-Null
}

function Wait-ProxiServiceCounts {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$ClusterName,
        [Parameter(Mandatory)]
        [string[]]$ServiceNames,
        [Parameter(Mandatory)]
        [ValidateRange(0, 1)]
        [int]$ExpectedCount,
        [int]$MaximumAttempts = 120
    )

    for ($attempt = 0; $attempt -lt $MaximumAttempts; $attempt++) {
        $services = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $ServiceNames
        $ready = @($services | Where-Object {
            $_.desiredCount -eq $ExpectedCount -and
            $_.runningCount -eq $ExpectedCount -and
            $_.pendingCount -eq 0
        }).Count -eq $ServiceNames.Count
        if ($ready) {
            return $services
        }
        Start-Sleep -Seconds 5
    }

    throw "ECS services did not reach expected count $ExpectedCount."
}

function Wait-ProxiServicesStable {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$ClusterName,
        [Parameter(Mandatory)]
        [string[]]$ServiceNames
    )

    & aws ecs wait services-stable `
        --cluster $ClusterName `
        --services $ServiceNames `
        --profile $Profile `
        --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw "ECS services did not become stable."
    }

    return Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $ServiceNames
}

function Get-ProxiLoadBalancer {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$LoadBalancerName,
        [switch]$AllowMissing
    )

    $result = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-load-balancers"
    )
    $matches = @($result.LoadBalancers | Where-Object LoadBalancerName -eq $LoadBalancerName)
    if ($matches.Count -eq 0 -and $AllowMissing) {
        return $null
    }
    if ($matches.Count -ne 1) {
        throw "ALB discovery is ambiguous for $LoadBalancerName."
    }

    return $matches[0]
}

function Get-ProxiPowerState {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$AccountId,
        [Parameter(Mandatory)]
        [string]$ClusterName,
        [Parameter(Mandatory)]
        [string]$LoadBalancerName,
        [Parameter(Mandatory)]
        [string]$FrontendServiceName,
        [Parameter(Mandatory)]
        [string]$ApiServiceName,
        [Parameter(Mandatory)]
        [string]$WorkerServiceName,
        [Parameter(Mandatory)]
        [string]$DomainName
    )

    Assert-ProxiDeploymentIdentity -Profile $Profile -Region $Region -AccountId $AccountId | Out-Null

    $clusterResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ecs", "describe-clusters", "--clusters", $ClusterName
    )
    $clusters = @($clusterResult.clusters | Where-Object clusterName -eq $ClusterName)
    if ($clusters.Count -ne 1 -or $clusters[0].status -ne "ACTIVE") {
        throw "Expected one active ProxiAI ECS cluster."
    }

    $serviceNames = @($FrontendServiceName, $ApiServiceName, $WorkerServiceName)
    $services = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $serviceNames
    $frontendService = @($services | Where-Object serviceName -eq $FrontendServiceName)[0]
    $apiService = @($services | Where-Object serviceName -eq $ApiServiceName)[0]
    $workerService = @($services | Where-Object serviceName -eq $WorkerServiceName)[0]

    if (@($frontendService.loadBalancers).Count -ne 1 -or @($apiService.loadBalancers).Count -ne 1) {
        throw "Frontend and API must each use exactly one target group."
    }
    if (@($workerService.loadBalancers).Count -ne 0) {
        throw "Worker service must not use a load balancer."
    }

    $frontendTargetGroupArn = $frontendService.loadBalancers[0].targetGroupArn
    $apiTargetGroupArn = $apiService.loadBalancers[0].targetGroupArn
    $loadBalancer = Get-ProxiLoadBalancer -Profile $Profile -Region $Region -LoadBalancerName $LoadBalancerName
    if ($loadBalancer.Type -ne "application" -or $loadBalancer.Scheme -ne "internet-facing") {
        throw "The discovered load balancer is not the expected public ALB."
    }

    $targetGroupArguments = @(
        "elbv2", "describe-target-groups",
        "--target-group-arns"
    ) + @($frontendTargetGroupArn, $apiTargetGroupArn)
    $targetGroupResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments $targetGroupArguments
    $targetGroups = @($targetGroupResult.TargetGroups)
    foreach ($targetGroup in $targetGroups) {
        if ($targetGroup.VpcId -ne $loadBalancer.VpcId -or $targetGroup.LoadBalancerArns -notcontains $loadBalancer.LoadBalancerArn) {
            throw "Target group is not attached to the expected ProxiAI ALB."
        }
    }

    $listenerResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-listeners", "--load-balancer-arn", $loadBalancer.LoadBalancerArn
    )
    $listeners = @($listenerResult.Listeners)
    $httpsListeners = @($listeners | Where-Object { $_.Protocol -eq "HTTPS" -and $_.Port -eq 443 })
    if ($httpsListeners.Count -ne 1) {
        throw "Expected exactly one ProxiAI HTTPS listener."
    }
    $httpsListener = $httpsListeners[0]
    $certificateArns = @($httpsListener.Certificates.CertificateArn | Where-Object { $_ })
    if ($certificateArns.Count -ne 1) {
        throw "Expected exactly one default ACM certificate."
    }
    if (@($httpsListener.DefaultActions).Count -ne 1 -or $httpsListener.DefaultActions[0].TargetGroupArn -ne $frontendTargetGroupArn) {
        throw "HTTPS default action must forward to the frontend target group."
    }

    $ruleResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-rules", "--listener-arn", $httpsListener.ListenerArn
    )
    $rules = @($ruleResult.Rules | Where-Object { -not $_.IsDefault })
    $apiRule = @($rules | Where-Object Priority -eq "10")
    $healthRule = @($rules | Where-Object Priority -eq "20")
    if ($apiRule.Count -ne 1 -or $healthRule.Count -ne 1) {
        throw "Expected ProxiAI listener priorities 10 and 20."
    }
    if ($apiRule[0].Conditions.Values -notcontains "/api/*" -or $apiRule[0].Actions[0].TargetGroupArn -ne $apiTargetGroupArn) {
        throw "Priority 10 is not the expected API rule."
    }
    if ($healthRule[0].Conditions.Values -notcontains "/health/*" -or $healthRule[0].Actions[0].TargetGroupArn -ne $apiTargetGroupArn) {
        throw "Priority 20 is not the expected health rule."
    }

    $privateSubnetSets = @($services | ForEach-Object {
        @($_.networkConfiguration.awsvpcConfiguration.subnets) -join ","
    } | Select-Object -Unique)
    $ecsSecurityGroupSets = @($services | ForEach-Object {
        @($_.networkConfiguration.awsvpcConfiguration.securityGroups) -join ","
    } | Select-Object -Unique)
    if ($privateSubnetSets.Count -ne 1 -or $ecsSecurityGroupSets.Count -ne 1) {
        throw "ECS services do not share one approved private network configuration."
    }
    if (@($services | Where-Object { $_.networkConfiguration.awsvpcConfiguration.assignPublicIp -ne "DISABLED" }).Count -gt 0) {
        throw "ECS tasks must not receive public IP addresses."
    }
    $privateSubnetIds = @($frontendService.networkConfiguration.awsvpcConfiguration.subnets)
    $ecsSecurityGroupIds = @($frontendService.networkConfiguration.awsvpcConfiguration.securityGroups)

    $routeTableIds = @()
    foreach ($subnetId in $privateSubnetIds) {
        $routeTableResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "describe-route-tables",
            "--filters", "Name=association.subnet-id,Values=$subnetId"
        )
        $subnetRouteTables = @($routeTableResult.RouteTables)
        if ($subnetRouteTables.Count -ne 1) {
            throw "Private route-table discovery is ambiguous for $subnetId."
        }
        $routeTableIds += $subnetRouteTables[0].RouteTableId
    }
    $routeTableIds = @($routeTableIds | Select-Object -Unique)
    if ($routeTableIds.Count -ne 1) {
        throw "Private ECS subnets do not share one route table."
    }
    $privateRouteTableId = $routeTableIds[0]
    $privateRouteTableResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ec2", "describe-route-tables", "--route-table-ids", $privateRouteTableId
    )
    $defaultNatRoutes = @($privateRouteTableResult.RouteTables[0].Routes | Where-Object {
        $_.DestinationCidrBlock -eq "0.0.0.0/0" -and $_.NatGatewayId
    })
    if ($defaultNatRoutes.Count -ne 1) {
        throw "Expected one private default route through NAT."
    }
    $natGatewayId = $defaultNatRoutes[0].NatGatewayId
    $natResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "ec2", "describe-nat-gateways", "--nat-gateway-ids", $natGatewayId
    )
    $natGateways = @($natResult.NatGateways)
    if ($natGateways.Count -ne 1 -or $natGateways[0].VpcId -ne $loadBalancer.VpcId) {
        throw "NAT Gateway is not in the expected ProxiAI VPC."
    }
    $natAddresses = @($natGateways[0].NatGatewayAddresses)
    if ($natAddresses.Count -ne 1 -or -not $natAddresses[0].AllocationId) {
        throw "Expected exactly one preserved NAT EIP allocation."
    }

    $zoneResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "route53", "list-hosted-zones-by-name", "--dns-name", $DomainName
    )
    $hostedZones = @($zoneResult.HostedZones | Where-Object Name -eq "$DomainName.")
    if ($hostedZones.Count -ne 1) {
        throw "Route 53 hosted-zone discovery is ambiguous for $DomainName."
    }
    $hostedZoneId = $hostedZones[0].Id -replace "^/hostedzone/", ""
    $recordResult = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "route53", "list-resource-record-sets", "--hosted-zone-id", $hostedZoneId
    )
    $domainRecords = @($recordResult.ResourceRecordSets | Where-Object {
        $_.Name -eq "$DomainName." -and $_.Type -in @("A", "AAAA")
    })
    $aliasRecords = @($domainRecords | Where-Object AliasTarget)
    if ($aliasRecords.Count -lt 1) {
        throw "Expected at least one ProxiAI ALB alias record."
    }
    $expectedDnsNames = @("$($loadBalancer.DNSName).", "dualstack.$($loadBalancer.DNSName).")
    if (@($aliasRecords | Where-Object { $_.AliasTarget.DNSName -notin $expectedDnsNames }).Count -gt 0) {
        throw "Domain alias does not target the expected ProxiAI ALB."
    }

    return [ordered]@{
        schemaVersion = 1
        capturedAt = [DateTimeOffset]::UtcNow.ToString("o")
        accountId = $AccountId
        region = $Region
        clusterName = $ClusterName
        vpcId = $loadBalancer.VpcId
        publicSubnetIds = @($loadBalancer.AvailabilityZones.SubnetId)
        privateSubnetIds = $privateSubnetIds
        ecsSecurityGroupIds = $ecsSecurityGroupIds
        services = [ordered]@{
            frontend = [ordered]@{ name = $FrontendServiceName; desiredCount = $frontendService.desiredCount }
            api = [ordered]@{ name = $ApiServiceName; desiredCount = $apiService.desiredCount }
            worker = [ordered]@{ name = $WorkerServiceName; desiredCount = $workerService.desiredCount }
        }
        loadBalancer = [ordered]@{
            name = $loadBalancer.LoadBalancerName
            arn = $loadBalancer.LoadBalancerArn
            dnsName = $loadBalancer.DNSName
            canonicalHostedZoneId = $loadBalancer.CanonicalHostedZoneId
            scheme = $loadBalancer.Scheme
            type = $loadBalancer.Type
            ipAddressType = $loadBalancer.IpAddressType
            securityGroupIds = @($loadBalancer.SecurityGroups)
            subnetIds = @($loadBalancer.AvailabilityZones.SubnetId)
        }
        targetGroups = [ordered]@{
            frontendArn = $frontendTargetGroupArn
            apiArn = $apiTargetGroupArn
        }
        listeners = [ordered]@{
            http = @($listeners | Where-Object { $_.Protocol -eq "HTTP" -and $_.Port -eq 80 } | ForEach-Object {
                [ordered]@{ arn = $_.ListenerArn; defaultActions = @($_.DefaultActions) }
            })
            https = [ordered]@{
                arn = $httpsListener.ListenerArn
                sslPolicy = $httpsListener.SslPolicy
                certificateArn = $certificateArns[0]
                defaultTargetGroupArn = $frontendTargetGroupArn
            }
            rules = @(
                [ordered]@{ priority = 10; pathPattern = "/api/*"; targetGroupArn = $apiTargetGroupArn },
                [ordered]@{ priority = 20; pathPattern = "/health/*"; targetGroupArn = $apiTargetGroupArn }
            )
        }
        route53 = [ordered]@{
            hostedZoneId = $hostedZoneId
            recordName = "$DomainName."
            records = $aliasRecords
        }
        nat = [ordered]@{
            gatewayId = $natGatewayId
            subnetId = $natGateways[0].SubnetId
            eipAllocationId = $natAddresses[0].AllocationId
            privateRouteTableId = $privateRouteTableId
        }
    }
}

function Test-ProxiPublicEndpoints {
    param(
        [Parameter(Mandatory)]
        [string]$BaseUrl
    )

    $checks = [ordered]@{}
    foreach ($path in @("/", "/health/live", "/health/ready")) {
        try {
            $response = Invoke-WebRequest -Uri "$BaseUrl$path" -TimeoutSec 30
            $checks[$path] = $response.StatusCode
        }
        catch {
            $checks[$path] = "FAIL"
        }
    }

    $passed = @($checks.Values | Where-Object { $_ -ne 200 }).Count -eq 0
    return [pscustomobject]@{ Passed = $passed; Checks = $checks }
}

function Write-ProxiJsonFile {
    param(
        [Parameter(Mandatory)]
        [object]$Value,
        [Parameter(Mandatory)]
        [string]$Path
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporaryPath = "$Path.tmp"
    try {
        ConvertTo-Json -InputObject $Value -Depth 30 | Set-Content -LiteralPath $temporaryPath -Encoding utf8NoBOM
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    }
    finally {
        Remove-Item -LiteralPath $temporaryPath -ErrorAction SilentlyContinue
    }
}

function Invoke-ProxiRoute53Change {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$HostedZoneId,
        [Parameter(Mandatory)]
        [ValidateSet("DELETE", "UPSERT")]
        [string]$Action,
        [Parameter(Mandatory)]
        [object]$ResourceRecordSet
    )

    $changePath = Join-Path $env:TEMP "proxiai-route53-$([Guid]::NewGuid().ToString('N')).json"
    try {
        Write-ProxiJsonFile -Path $changePath -Value ([ordered]@{
            Comment = "ProxiAI demo power control"
            Changes = @(
                [ordered]@{
                    Action = $Action
                    ResourceRecordSet = $ResourceRecordSet
                }
            )
        })
        return Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "route53", "change-resource-record-sets",
            "--hosted-zone-id", $HostedZoneId,
            "--change-batch", "file://$changePath"
        )
    }
    finally {
        Remove-Item -LiteralPath $changePath -ErrorAction SilentlyContinue
    }
}

function Wait-ProxiNatGatewayState {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$NatGatewayId,
        [Parameter(Mandatory)]
        [ValidateSet("available", "deleted")]
        [string]$ExpectedState,
        [int]$MaximumAttempts = 120
    )

    for ($attempt = 0; $attempt -lt $MaximumAttempts; $attempt++) {
        $result = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
            "ec2", "describe-nat-gateways", "--nat-gateway-ids", $NatGatewayId
        )
        $gateways = @($result.NatGateways)
        if ($gateways.Count -eq 1 -and $gateways[0].State -eq $ExpectedState) {
            return $gateways[0]
        }
        if ($gateways.Count -eq 1 -and $gateways[0].State -eq "failed") {
            throw "NAT Gateway entered failed state."
        }
        Start-Sleep -Seconds 10
    }

    throw "NAT Gateway did not reach $ExpectedState state."
}

function Get-ProxiTargetHealthSummary {
    param(
        [Parameter(Mandatory)]
        [string]$Profile,
        [Parameter(Mandatory)]
        [string]$Region,
        [Parameter(Mandatory)]
        [string]$TargetGroupArn
    )

    $result = Invoke-ProxiAwsJson -Profile $Profile -Region $Region -Arguments @(
        "elbv2", "describe-target-health", "--target-group-arn", $TargetGroupArn
    )
    return @($result.TargetHealthDescriptions | ForEach-Object {
        [pscustomobject]@{
            Target = $_.Target.Id
            Port = $_.Target.Port
            State = $_.TargetHealth.State
            Reason = $_.TargetHealth.Reason
        }
    })
}
