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
        [int]$MaximumAttempts = 120,
        [ValidateRange(1, 12)]
        [int]$ConsecutiveReadyChecks = 1,
        [ValidateRange(0, 60)]
        [int]$PollIntervalSeconds = 5
    )

    $consecutiveReady = 0
    for ($attempt = 0; $attempt -lt $MaximumAttempts; $attempt++) {
        $services = Get-ProxiServices -Profile $Profile -Region $Region -ClusterName $ClusterName -ServiceNames $ServiceNames
        $ready = @($services | Where-Object {
            $_.desiredCount -eq $ExpectedCount -and
            $_.runningCount -eq $ExpectedCount -and
            $_.pendingCount -eq 0
        }).Count -eq $ServiceNames.Count
        if ($ready) {
            $consecutiveReady++
            if ($consecutiveReady -ge $ConsecutiveReadyChecks) {
                return $services
            }
        }
        else {
            $consecutiveReady = 0
        }
        if ($attempt + 1 -lt $MaximumAttempts -and $PollIntervalSeconds -gt 0) {
            Start-Sleep -Seconds $PollIntervalSeconds
        }
    }

    $serviceSummary = @($services | ForEach-Object {
        "$($_.serviceName)=$($_.runningCount)/$($_.desiredCount),pending=$($_.pendingCount)"
    }) -join "; "
    throw "ECS services did not sustain expected count $ExpectedCount. $serviceSummary"
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

    return Wait-ProxiServiceCounts `
        -Profile $Profile `
        -Region $Region `
        -ClusterName $ClusterName `
        -ServiceNames $ServiceNames `
        -ExpectedCount 1 `
        -ConsecutiveReadyChecks 3
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
    $httpListeners = @($listeners | Where-Object { $_.Protocol -eq "HTTP" -and $_.Port -eq 80 })
    if ($httpListeners.Count -gt 1) {
        throw "Expected at most one ProxiAI HTTP listener."
    }
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
        schemaVersion = 2
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
            subnetMappings = @($loadBalancer.AvailabilityZones | ForEach-Object {
                [ordered]@{
                    zoneName = $_.ZoneName
                    subnetId = $_.SubnetId
                    loadBalancerAddresses = @($_.LoadBalancerAddresses)
                }
            })
        }
        targetGroups = [ordered]@{
            frontendArn = $frontendTargetGroupArn
            apiArn = $apiTargetGroupArn
        }
        listeners = [ordered]@{
            http = [ordered]@{
                present = $httpListeners.Count -eq 1
                arn = if ($httpListeners.Count -eq 1) { $httpListeners[0].ListenerArn } else { $null }
                protocol = "HTTP"
                port = 80
                defaultActions = if ($httpListeners.Count -eq 1) { @($httpListeners[0].DefaultActions) } else { @() }
                restoreDefaultAction = [ordered]@{
                    type = "redirect"
                    protocol = "HTTPS"
                    port = 443
                    statusCode = "HTTP_301"
                }
            }
            https = [ordered]@{
                protocol = "HTTPS"
                port = 443
                arn = $httpsListener.ListenerArn
                sslPolicy = $httpsListener.SslPolicy
                certificateArn = $certificateArns[0]
                defaultTargetGroupArn = $frontendTargetGroupArn
                defaultActions = @($httpsListener.DefaultActions)
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

function Assert-ProxiPowerState {
    param(
        [Parameter(Mandatory)]
        [object]$State,
        [Parameter(Mandatory)]
        [string]$AccountId,
        [Parameter(Mandatory)]
        [string]$Region,
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

    if ($State.schemaVersion -ne 2) {
        throw "Recovery snapshot schema version is unsupported."
    }
    if ($State.accountId -ne $AccountId -or $State.region -ne $Region -or $State.clusterName -ne $ClusterName) {
        throw "Recovery snapshot account, region, or cluster is invalid."
    }
    if ([string]::IsNullOrWhiteSpace($State.capturedAt)) {
        throw "Recovery snapshot capture time is missing."
    }
    if ($State.vpcId -notmatch "^vpc-[a-z0-9]+$") {
        throw "Recovery snapshot VPC ID is invalid."
    }

    $publicSubnetIds = @($State.publicSubnetIds)
    $privateSubnetIds = @($State.privateSubnetIds)
    if ($publicSubnetIds.Count -lt 2 -or @($publicSubnetIds | Where-Object { $_ -notmatch "^subnet-[a-z0-9]+$" }).Count -gt 0) {
        throw "Recovery snapshot public subnet IDs are invalid."
    }
    if ($privateSubnetIds.Count -lt 2 -or @($privateSubnetIds | Where-Object { $_ -notmatch "^subnet-[a-z0-9]+$" }).Count -gt 0) {
        throw "Recovery snapshot private subnet IDs are invalid."
    }

    if ($State.loadBalancer.name -ne $LoadBalancerName) {
        throw "Recovery snapshot ALB name is invalid."
    }
    if ($State.loadBalancer.arn -notmatch "^arn:aws:elasticloadbalancing:$([regex]::Escape($Region)):$([regex]::Escape($AccountId)):loadbalancer/app/$([regex]::Escape($LoadBalancerName))/") {
        throw "Recovery snapshot ALB ARN is invalid."
    }
    if ([string]::IsNullOrWhiteSpace($State.loadBalancer.dnsName)) {
        throw "Recovery snapshot ALB DNS name is missing."
    }
    if ([string]::IsNullOrWhiteSpace($State.loadBalancer.canonicalHostedZoneId) -or
        $State.loadBalancer.scheme -ne "internet-facing" -or
        $State.loadBalancer.type -ne "application" -or
        $State.loadBalancer.ipAddressType -notin @("ipv4", "dualstack")) {
        throw "Recovery snapshot ALB configuration is invalid."
    }
    $albSecurityGroupIds = @($State.loadBalancer.securityGroupIds)
    if ($albSecurityGroupIds.Count -lt 1 -or @($albSecurityGroupIds | Where-Object { $_ -notmatch "^sg-[a-z0-9]+$" }).Count -gt 0) {
        throw "Recovery snapshot ALB security groups are invalid."
    }
    $albSubnetIds = @($State.loadBalancer.subnetIds)
    $subnetMappings = @($State.loadBalancer.subnetMappings)
    if ($albSubnetIds.Count -lt 2 -or $subnetMappings.Count -ne $albSubnetIds.Count) {
        throw "Recovery snapshot ALB subnet mappings are incomplete."
    }
    if ((Compare-Object @($albSubnetIds | Sort-Object) @($publicSubnetIds | Sort-Object))) {
        throw "Recovery snapshot ALB subnets do not match the public subnet set."
    }
    foreach ($mapping in $subnetMappings) {
        if ($mapping.subnetId -notin $albSubnetIds -or [string]::IsNullOrWhiteSpace($mapping.zoneName)) {
            throw "Recovery snapshot ALB subnet mapping is invalid."
        }
    }

    if ($State.targetGroups.frontendArn -notmatch ":targetgroup/proxiai-frontend-tg/" -or $State.targetGroups.apiArn -notmatch ":targetgroup/proxiai-api-tg/") {
        throw "Recovery snapshot target group ARNs are invalid."
    }
    if ($State.targetGroups.frontendArn -eq $State.targetGroups.apiArn) {
        throw "Recovery snapshot target groups must be distinct."
    }

    if ($State.listeners.http.PSObject.Properties.Name -notcontains "present" -or
        $State.listeners.http.present -isnot [bool] -or
        $State.listeners.http.protocol -ne "HTTP" -or
        $State.listeners.http.port -ne 80) {
        throw "Recovery snapshot HTTP listener configuration is invalid."
    }
    if ($State.listeners.http.restoreDefaultAction.type -ne "redirect" -or
        $State.listeners.http.restoreDefaultAction.protocol -ne "HTTPS" -or
        $State.listeners.http.restoreDefaultAction.port -ne 443 -or
        $State.listeners.http.restoreDefaultAction.statusCode -ne "HTTP_301") {
        throw "Recovery snapshot HTTP redirect restoration config is invalid."
    }
    if ($State.listeners.http.present -and [string]::IsNullOrWhiteSpace($State.listeners.http.arn)) {
        throw "Recovery snapshot says the HTTP listener exists but its ARN is missing."
    }
    if ($State.listeners.https.protocol -ne "HTTPS" -or $State.listeners.https.port -ne 443) {
        throw "Recovery snapshot HTTPS listener configuration is invalid."
    }
    if ([string]::IsNullOrWhiteSpace($State.listeners.https.arn) -or
        [string]::IsNullOrWhiteSpace($State.listeners.https.sslPolicy) -or
        $State.listeners.https.certificateArn -notmatch "^arn:aws:acm:$([regex]::Escape($Region)):$([regex]::Escape($AccountId)):certificate/") {
        throw "Recovery snapshot HTTPS listener or ACM certificate is invalid."
    }
    if ($State.listeners.https.defaultTargetGroupArn -ne $State.targetGroups.frontendArn) {
        throw "Recovery snapshot HTTPS default target is invalid."
    }
    if (@($State.listeners.https.defaultActions).Count -ne 1 -or $State.listeners.https.defaultActions[0].TargetGroupArn -ne $State.targetGroups.frontendArn) {
        throw "Recovery snapshot HTTPS default action is invalid."
    }
    $rules = @($State.listeners.rules)
    if ($rules.Count -ne 2) {
        throw "Recovery snapshot listener rules are incomplete."
    }
    $apiRule = @($rules | Where-Object { $_.priority -eq 10 -and $_.pathPattern -eq "/api/*" -and $_.targetGroupArn -eq $State.targetGroups.apiArn })
    $healthRule = @($rules | Where-Object { $_.priority -eq 20 -and $_.pathPattern -eq "/health/*" -and $_.targetGroupArn -eq $State.targetGroups.apiArn })
    if ($apiRule.Count -ne 1 -or $healthRule.Count -ne 1) {
        throw "Recovery snapshot listener priorities or routes are invalid."
    }

    if ($State.route53.hostedZoneId -notmatch "^[A-Z0-9]+$" -or $State.route53.recordName -ne "$DomainName.") {
        throw "Recovery snapshot Route 53 metadata is invalid."
    }
    $route53Records = @($State.route53.records)
    if ($route53Records.Count -lt 1 -or @($route53Records | Where-Object {
        $_.Name -ne "$DomainName." -or $_.Type -notin @("A", "AAAA") -or -not $_.AliasTarget
    }).Count -gt 0) {
        throw "Recovery snapshot proxiai.me alias record is invalid."
    }
    $expectedAliasDnsNames = @("$($State.loadBalancer.dnsName).", "dualstack.$($State.loadBalancer.dnsName).")
    if (@($route53Records | Where-Object { $_.AliasTarget.DNSName -notin $expectedAliasDnsNames }).Count -gt 0) {
        throw "Recovery snapshot proxiai.me alias does not target the snapshotted ALB."
    }

    if ($State.nat.gatewayId -notmatch "^nat-[a-z0-9]+$" -or
        $State.nat.subnetId -notmatch "^subnet-[a-z0-9]+$" -or
        $State.nat.eipAllocationId -notmatch "^eipalloc-[a-z0-9]+$" -or
        $State.nat.privateRouteTableId -notmatch "^rtb-[a-z0-9]+$") {
        throw "Recovery snapshot NAT or private route-table metadata is invalid."
    }
    if ($State.nat.subnetId -notin $publicSubnetIds) {
        throw "Recovery snapshot NAT subnet is not one of the public ALB subnets."
    }

    $expectedServices = @(
        @{ State = $State.services.frontend; Name = $FrontendServiceName },
        @{ State = $State.services.api; Name = $ApiServiceName },
        @{ State = $State.services.worker; Name = $WorkerServiceName }
    )
    foreach ($service in $expectedServices) {
        if ($service.State.name -ne $service.Name -or $service.State.desiredCount -notin @(0, 1)) {
            throw "Recovery snapshot ECS desired count is invalid for $($service.Name)."
        }
    }

    return $State
}

function Test-ProxiPublicEndpoints {
    param(
        [Parameter(Mandatory)]
        [string]$BaseUrl,
        [ValidateRange(1, 60)]
        [int]$MaximumAttempts = 12,
        [ValidateRange(0, 60)]
        [int]$RetryDelaySeconds = 10
    )

    for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt++) {
        $checks = [ordered]@{}
        foreach ($path in @("/", "/health/live", "/health/ready")) {
            try {
                $response = Invoke-WebRequest `
                    -Uri "$BaseUrl$path" `
                    -TimeoutSec 30 `
                    -UseBasicParsing
                $checks[$path] = $response.StatusCode
            }
            catch {
                $checks[$path] = "FAIL"
            }
        }

        $passed = @($checks.Values | Where-Object { $_ -ne 200 }).Count -eq 0
        if ($passed -or $attempt -eq $MaximumAttempts) {
            return [pscustomobject]@{
                Passed = $passed
                Checks = $checks
                Attempts = $attempt
            }
        }
        if ($RetryDelaySeconds -gt 0) {
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }
}

function Get-ProxiPublicSmokeSummary {
    param(
        [Parameter(Mandatory)]
        [object]$Smoke
    )

    $checks = @($Smoke.Checks.GetEnumerator() | ForEach-Object {
        "$($_.Key)=$($_.Value)"
    }) -join ", "
    return "attempts=$($Smoke.Attempts); $checks"
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
