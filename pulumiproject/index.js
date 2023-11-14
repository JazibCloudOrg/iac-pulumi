const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

const vpcCidrBlock = new pulumi.Config("myVPCModule").require("vpcCidrBlock");
const destinationCidrBlock = new pulumi.Config("myVPCModule").require("destinationCidrBlock");
const subnetSize = new pulumi.Config("myVPCModule").require("subnetSize");
const subnetCidrPrefix = new pulumi.Config("myVPCModule").require("subnetCidrPrefix");
const ec2instanceType = new pulumi.Config("myVPCModule").require("ec2instanceType");
const ec2keyName = new pulumi.Config("myVPCModule").require("ec2keyName");
const ec2volumneSize = new pulumi.Config("myVPCModule").require("ec2volumneSize");
const ec2volumeType = new pulumi.Config("myVPCModule").require("ec2volumeType");
const rdsstorage = new pulumi.Config("myRDSModule").require("rdsstorage");
const rdsstorageType = new pulumi.Config("myRDSModule").require("rdsstorageType");
const rdsengine = new pulumi.Config("myRDSModule").require("rdsengine");
const rdsengineVersion = new pulumi.Config("myRDSModule").require("rdsengineVersion");
const rdsinstanceClass = new pulumi.Config("myRDSModule").require("rdsinstanceClass");
const rdsdbInstanceIdentifier = new pulumi.Config("myRDSModule").require("rdsdbInstanceIdentifier");
const rdsusername = new pulumi.Config("myRDSModule").require("rdsusername");
const rdspassword = new pulumi.Config("myRDSModule").require("rdspassword");
const rdsdbName = new pulumi.Config("myRDSModule").require("rdsdbName");
//const zoneId = new pulumi.Config("myRoute53Module").require("zoneId");
const domainName = new pulumi.Config("myRoute53Module").require("domainName");
const dnsRecordType = new pulumi.Config("myRoute53Module").require("dnsRecordType");
const dnsRecordTtl = new pulumi.Config("myRoute53Module").require("dnsRecordTtl");


const availableZones = async () => {
    try{
        const zones = await aws.getAvailabilityZones({
            state: "available",
        });
        return zones.names;
    } catch (error) {
        throw new Error(`Error fetching availability zones: ${error}`);
    }
};

availableZones().then((zones) => {
    if (zones.length === 0) {
        throw new Error("No availability zones available in the selected region.");
    }

    const main = new aws.ec2.Vpc("main", {
        cidrBlock: vpcCidrBlock,
        instanceTenancy: "default",
        tags: {
            Name: "myvpc",
        },
    });

    const gw = new aws.ec2.InternetGateway("gw", {
        tags: {
            Name: "mygw",
        },
    });

    const InternetGatewayAttachment = new aws.ec2.InternetGatewayAttachment("InternetGatewayAttachment", {
        internetGatewayId: gw.id,
        vpcId: main.id,
    });

    const loadbalancerSecurityGroup = new aws.ec2.SecurityGroup("loadbalancer-security-group", {
        description: "Security group for load balancer",
        vpcId: main.id,
    });

    const ingressRulesLb = [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }, // HTTP
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] } // HTTPS
    ];

    for (const rule of ingressRulesLb) {
        new aws.ec2.SecurityGroupRule(`ingress-${rule.fromPort}`, {
            type: "ingress",
            fromPort: rule.fromPort,
            toPort: rule.toPort,
            protocol: rule.protocol,
            securityGroupId: loadbalancerSecurityGroup.id,
            cidrBlocks: rule.cidrBlocks,
        });
    }

    const egressRuleLb = new aws.ec2.SecurityGroupRule("lb-outgress-rule", {
        type: "egress",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        securityGroupId: loadbalancerSecurityGroup.id,
    });

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("application-security-group", {
        description: "Security group for web applications",
        vpcId: main.id,
    });

    const ingressRules = [
        { protocol: "tcp", fromPort: 22, toPort: 22 }, // SSH
        { protocol: "tcp", fromPort: 8080, toPort: 8080 }
    ];

    new aws.ec2.SecurityGroupRule("ingress-22", {
        type: "ingress",
        fromPort: 22,
        toPort: 22,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
        securityGroupId: applicationSecurityGroup.id,
    });
    
    new aws.ec2.SecurityGroupRule("ingress-8080", {
        type: "ingress",
        fromPort: 8080,
        toPort: 8080,
        protocol: "tcp",
        securityGroupId: applicationSecurityGroup.id,
        sourceSecurityGroupId: loadbalancerSecurityGroup.id
    });

    const ec2OutgresRule = new aws.ec2.SecurityGroupRule("ec2-outgress-rule", {
        type: "egress",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        securityGroupId: applicationSecurityGroup.id,
    });

    const rdsSecurityGroup = new aws.ec2.SecurityGroup("database-security-group", {
        description: "Security group for RDS instances",
        vpcId: main.id,
    });

    const databaseIngressRule = new aws.ec2.SecurityGroupRule("database-ingress-rule", {
        type: "ingress",
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        securityGroupId: rdsSecurityGroup.id,
        sourceSecurityGroupId: applicationSecurityGroup.id,
        description: `Allow traffic from the application security group`,
    });

    const dbParameterGroup = new aws.rds.ParameterGroup("mypostgrespg", {
        family: "postgres15",
        description: "Custom DB Parameter Group for my RDS instance"
    });

    const publicRouteTable = new aws.ec2.RouteTable('public-route-table', {
        vpcId: main.id,
        tags: {
            Name: 'public-route-table',
        },
    });

    const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
        vpcId: main.id,
        tags: {
        Name: "private-route-table",
        },
    });

    const publicRoute = new aws.ec2.Route('public-route', {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: destinationCidrBlock,
        gatewayId: gw.id,
    });

    const availabilityZones = Math.min(3, zones.length);
    const generatedCIDRs = new Set();

    function generateRandomCIDRBlock() {
        let cidrBlock;
        do {
            const thirdOctet = Math.floor(Math.random() * 256);
            cidrBlock = `${subnetCidrPrefix}.${thirdOctet}.0/${subnetSize}`;
        } while (generatedCIDRs.has(cidrBlock));
  
        generatedCIDRs.add(cidrBlock);
        return cidrBlock;
    }

    let selectedSubnet;
    const privateSubnets = [];
    const publicSubnets = [];
  
    for (let i = 0; i < availabilityZones; i++) {
            const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
            vpcId: main.id,
            cidrBlock: generateRandomCIDRBlock(),
            availabilityZone: zones[i],
            mapPublicIpOnLaunch: true,
            tags: {
                Name: `public-subnet-${i}`,
            },
        });

        publicSubnets.push(publicSubnet.id);

        if (i === 0) {
            selectedSubnet = publicSubnet;
        }

            const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
            vpcId: main.id,
            cidrBlock: generateRandomCIDRBlock(),
            availabilityZone: zones[i],
            tags: {
                Name: `private-subnet-${i}`,
            },
        });

        privateSubnets.push(privateSubnet.id);

        new aws.ec2.RouteTableAssociation(`public-subnet-association-${i}`, {
            subnetId: publicSubnet.id,
            routeTableId: publicRouteTable.id,
        });

        new aws.ec2.RouteTableAssociation(`private-subnet-association-${i}`, {
            subnetId: privateSubnet.id,
            routeTableId: privateRouteTable.id,
        });
    }

    const rdsSubnetGroup = new aws.rds.SubnetGroup("myrdssubnetgroup", {
        subnetIds: privateSubnets,
        tags: {
            Name: "my-rds-subnet-group",
        },
    });

    const rdsInstance = new aws.rds.Instance("myrdsinstance", {
        allocatedStorage: rdsstorage,
        storageType: rdsstorageType,
        engine: rdsengine,
        engineVersion: rdsengineVersion,
        instanceClass: rdsinstanceClass,
        dbInstanceIdentifier: rdsdbInstanceIdentifier,
        username: rdsusername,
        password: rdspassword,
        skipFinalSnapshot: true,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        dbSubnetGroupName: rdsSubnetGroup.name,
        multiAZ: false,
        publiclyAccessible: false,
        dbName: rdsdbName,
        parameterGroupName: dbParameterGroup.name,
    });

    const userDataScriptBase64 = pulumi.all([rdsInstance.dbName, rdsInstance.username, rdsInstance.password, rdsInstance.address]).apply(([dbName, username, password, host]) => {
        const userDataScript = `#!/bin/bash
            envFile="/opt/mywebappdir/.env"
            > "$envFile"
            echo "PGDATABASE=${dbName}" >> "$envFile"
            echo "PGUSER=${username}" >> "$envFile"
            echo "PGPASSWORD=${password}" >> "$envFile"
            echo "PGHOST=${host}" >> "$envFile"
            echo "PGPORT=5432" >> "$envFile"
            sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
                -a fetch-config \
                -m ec2 \
                -c file:/opt/mywebappdir/cloudwatch_config.json \
                -s
            sudo systemctl daemon-reload
            sudo systemctl enable webapp
            sudo systemctl start webapp
        `;
    
        // Convert to Base64
        return Buffer.from(userDataScript).toString('base64');
    });

    const cloudWatchAgentServiceRole = new aws.iam.Role("cloudWatchAgentServiceRoleforec2", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "ec2.amazonaws.com",
                },
            }],
        }),
    });
 
    const clouldWatchAgenetPolicyArn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy";
    const cloudWatchAgentServiceRolePolicyAttachment = new aws.iam.PolicyAttachment("cloudWatchAgentServiceRolePolicyAttachment", {
        policyArn: clouldWatchAgenetPolicyArn,
        roles: [cloudWatchAgentServiceRole.name],
    });

    const instanceProfile = new aws.iam.InstanceProfile("myInstanceProfile", {
        role: cloudWatchAgentServiceRole.name,
    });

    const ami = aws.ec2.getAmi({
        mostRecent: true,
        filters: [
            { name: "name", values: ["my-ami-node*"] },
        ],
    });
    
    const amiId = ami.then(ami => ami.id);

    // const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
    //     ami: amiId,
    //     instanceType: ec2instanceType,
    //     vpcSecurityGroupIds: [applicationSecurityGroup.id],
    //     subnetId: selectedSubnet.id,
    //     keyName: ec2keyName,
    //     iamInstanceProfile: instanceProfile.name,
    //     //associatePublicIpAddress: true,
    //     disableApiTermination: false,
    //     userData: userDataScript,
    //     tags: {
    //         Name: "MyEC2Instance",
    //     },
    //     rootBlockDevice: {
    //         volumeSize: ec2volumneSize,
    //         volumeType: ec2volumeType,
    //         deleteOnTermination: true,
    //     },
    // });

    const launchTemplate = new aws.ec2.LaunchTemplate("webAppLaunchTemplate", {
        blockDeviceMappings: [{
            deviceName: "/dev/xvda",
            ebs: {
                volumeSize: ec2volumneSize,
                volumeType: ec2volumeType,
            },
        }],
        instanceType: ec2instanceType,
        keyName: ec2keyName,
        imageId: amiId,
        userData: userDataScriptBase64,
        iamInstanceProfile: {
            name: instanceProfile.name,
        },
        networkInterfaces: [{
            associatePublicIpAddress: true,
            securityGroups: [applicationSecurityGroup.id],
        }],
    });

    const appLoadBalancer = new aws.lb.LoadBalancer("myLoadBalancer", {
        internal: false,
        loadBalancerType: "application",
        securityGroups: [loadbalancerSecurityGroup.id],
        enableDeletionProtection: false,
        subnets: publicSubnets
    });

    const targetGroup = new aws.lb.TargetGroup("myTargetGroup", {
        port: 8080,
        protocol: "HTTP",
        vpcId: main.id,
        healthCheck: {
            enabled: true,
            interval: 300,
            path: "/healthz",
            port: 8080,
            //protocol: "HTTP",
            timeout: 5,
            healthyThreshold: 2,
            unhealthyThreshold: 2, 
            matcher: "200",
        },
    });

    const autoScalingGroup = new aws.autoscaling.Group("myAutoScalingGroup", {
        minSize: 1,
        maxSize: 3,
        desiredCapacity: 1,
        cooldown: 60,
        launchTemplate: {
            id: launchTemplate.id,
            version: "$Latest",
        },
        vpcZoneIdentifiers: publicSubnets,
        tags: [
            {
                key: "Name",
                value: "MyWebApp",
                propagateAtLaunch: true,
            }
        ],
        targetGroupArn: targetGroup.arn
    });

    const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
        adjustmentType: "ChangeInCapacity",
        //estimatedInstanceWarmup: 300,
        autoscalingGroupName: autoScalingGroup.name,
        policyType: "SimpleScaling",
        scalingAdjustment: 1,
        cooldown: 60
    });

    const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("ScaleUpAlarm", {
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "CPUUtilization",
        namespace: "AWS/EC2",
        period: 120,
        threshold: 5,
        statistic: "Average",
        dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
        },
        alarmDescription: "Raise alarm once cpu utilization increases beyond threshold",
        alarmActions: [scaleUpPolicy.arn]
    });

    const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
        adjustmentType: "ChangeInCapacity",
        //estimatedInstanceWarmup: 300,
        autoscalingGroupName: autoScalingGroup.name,
        policyType: "SimpleScaling",
        scalingAdjustment: -1,
        cooldown: 60
    });

    const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("ScaleDownAlarm", {
        comparisonOperator: "LessThanThreshold",
        evaluationPeriods: 1,
        metricName: "CPUUtilization",
        namespace: "AWS/EC2",
        period: 120,
        threshold: 3,
        statistic: "Average",
        dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
        },
        alarmDescription: "Raise alarm once cpu utilization decreases beyond threshold",
        alarmActions: [scaleDownPolicy.arn]
    });

    const autoScalingGroupAttachment = new aws.autoscaling.Attachment("autoScalingGroupAttachment", {
        autoscalingGroupName: autoScalingGroup.id,
        lbTargetGroupArn: targetGroup.arn,
    });

    const albListener = new aws.lb.Listener("myAlbListener", {
        loadBalancerArn: appLoadBalancer.arn,
        port: 80,
        protocol: "HTTP",
        defaultActions: [
            {
                type: "forward",
                targetGroupArn: targetGroup.arn,
            },
        ],
    });
    
    const myZone = aws.route53.getZone({ name: domainName });
    const myZoneId = myZone.then(zone => zone.zoneId);

    const webAppDNSRecord = new aws.route53.Record(`${domainName}-a-record`, {
        zoneId: myZoneId,
        name: domainName,
        type: dnsRecordType,
        aliases: [{
            name: appLoadBalancer.dnsName,
            zoneId: appLoadBalancer.zoneId,
            evaluateTargetHealth: true,
        }]
    });
}).catch((error) => {
    console.error(error);
});
