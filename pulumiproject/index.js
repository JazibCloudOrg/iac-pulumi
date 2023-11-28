const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const gcp = require("@pulumi/gcp");

const awsregion = new pulumi.Config("aws").require("region");
const gcpregion = new pulumi.Config("gcp").require("region");
const gcpproject = new pulumi.Config("gcp").require("project");
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
const applicationPort = new pulumi.Config("myApplicationModule").require("applicationPort");
const minimumSize = new pulumi.Config("myAutoScalingGroup").require("minimumSize");
const maximumSize = new pulumi.Config("myAutoScalingGroup").require("maximumSize");
const desiredCapacity = new pulumi.Config("myAutoScalingGroup").require("desiredCapacity");
const cooldownPeriod = new pulumi.Config("myAutoScalingGroup").require("cooldownPeriod");
const scaleUpThreshold = new pulumi.Config("myAutoScalingGroup").require("scaleUpThreshold");
const scaleUpPeriod = new pulumi.Config("myAutoScalingGroup").require("scaleUpPeriod");
const scaleDownThreshold = new pulumi.Config("myAutoScalingGroup").require("scaleDownThreshold");
const scaleDownPeriod = new pulumi.Config("myAutoScalingGroup").require("scaleDownPeriod");
const evaluationPeriods = new pulumi.Config("myAutoScalingGroup").require("evaluationPeriods");
const metricName = new pulumi.Config("myAutoScalingGroup").require("metricName");
const namespace = new pulumi.Config("myAutoScalingGroup").require("namespace");
const scalingUpAdjustment = new pulumi.Config("myAutoScalingGroup").require("scalingUpAdjustment");
const scalingDownAdjustment = new pulumi.Config("myAutoScalingGroup").require("scalingDownAdjustment");
const healthCheckPath = new pulumi.Config("myTargetGroup").require("healthCheckPath");
const healthyThreshold = new pulumi.Config("myTargetGroup").require("healthyThreshold");
const unhealthyThreshold = new pulumi.Config("myTargetGroup").require("unhealthyThreshold");
const healthCheckTimeout = new pulumi.Config("myTargetGroup").require("healthCheckTimeout");
const healthCheckInterval = new pulumi.Config("myTargetGroup").require("healthCheckInterval");
const healthCheckMatcher = new pulumi.Config("myTargetGroup").require("healthCheckMatcher");
const lambdaRuntime = new pulumi.Config("lambda").require("runtime");
const lambdaHandler = new pulumi.Config("lambda").require("handler");
const lambdaFunctionPath = new pulumi.Config("lambda").require("functionPath");

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

    const gcsBucket = new gcp.storage.Bucket("my-gcs-bucket", {
        location: gcpregion,
        versioning: {
            enabled: true,
        },
        forceDestroy: true
    });

    const serviceAccount = new gcp.serviceaccount.Account("my-service-account", {
        accountId: "my-service-account",
        project: gcpproject,
    });

    const objectAdminBinding = new gcp.projects.IAMBinding("objectAdminBinding", {
        project: gcpproject,
        role: "roles/storage.objectAdmin",
        members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
    });

    const serviceAccountKey = new gcp.serviceaccount.Key("my-service-account-key", {
        serviceAccountId: serviceAccount.name,
        publicKeyType: "TYPE_X509_PEM_FILE",
    });

    const myTopic = new aws.sns.Topic("myTopic");

    const snsUser = new aws.iam.User("snsUser");

    const snsPolicy = new aws.iam.Policy("snsPolicy", {
        description: "Policy for SNS access",
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: [
                    "sns:Publish",
                    "sns:Subscribe",
                ],
                Effect: "Allow",
                Resource: "*",
            }],
        }),
    });

    const snsUserPolicyAttachment = new aws.iam.UserPolicyAttachment("snsUserPolicyAttachment", {
        policyArn: snsPolicy.arn,
        user: snsUser.name,
    });

    const snsAccessKeys = new aws.iam.AccessKey("snsAccessKeys", {
        user: snsUser.name,
    });

    const lambdaFunctionRole = new aws.iam.Role("lambdaFunctionRole", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: "lambda.amazonaws.com",
                },
            }],
        }),
    });

    const lambdaRolePolicyArn = "arn:aws:iam::aws:policy/service-role/AWSLambdaRole";
    const lambdaFunctionRolePolicyAttachment = new aws.iam.PolicyAttachment("lambdaFunctionRolePolicyAttachment", {
        policyArn: lambdaRolePolicyArn,
        roles: [lambdaFunctionRole.name],
    });

    const lambdaBasicExecutionRolePolicyAttachment = new aws.iam.PolicyAttachment("lambdaBasicExecutionRolePolicyAttachment", {
        policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        roles: [lambdaFunctionRole.name],
    });

    const lambdaSESFullAccessPolicyAttachment = new aws.iam.PolicyAttachment("lambdaSESFullAccessPolicyAttachment", {
        policyArn: "arn:aws:iam::aws:policy/AmazonSESFullAccess",
        roles: [lambdaFunctionRole.name],
    });

    const dynamoDBTable = new aws.dynamodb.Table("EmailTracking", {
        attributes: [
            {
                name: "EmailId",
                type: "S",
            },
            {
                name: "ReceiverEmail",
                type: "S",
            },
            {
                name: "Status",
                type: "S",
            },
            {
                name: "EmailBody",
                type: "S",
            },
        ],
        hashKey: "EmailId",
        billingMode: "PAY_PER_REQUEST",
        globalSecondaryIndexes: [
            {
                name: "ReceiverEmailIndex",
                hashKey: "ReceiverEmail",
                projectionType: "ALL",
            },
            {
                name: "StatusIndex",
                hashKey: "Status",
                projectionType: "ALL",
            },
            {
                name: "EmailBodyIndex",
                hashKey: "EmailBody",
                projectionType: "ALL",
            },
        ],
    });

    const dynamoDBPolicy = new aws.iam.Policy("dynamoDBPolicy", {
        description: "Allow PutItem and GetItem in DynamoDB",
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: [
                        "dynamodb:GetItem",
                        "dynamodb:PutItem",
                    ],
                    Resource: "*",
                },
            ],
        }),
    });
    
    const dynamoDBPolicyAttachment = new aws.iam.PolicyAttachment("dynamoDBPolicyAttachment", {
        policyArn: dynamoDBPolicy.arn,
        roles: [lambdaFunctionRole.name],
    });


    const lambdaFunction = new aws.lambda.Function("my-lambda-function", {
        runtime: lambdaRuntime,
        handler: lambdaHandler,
        code: new pulumi.asset.AssetArchive({
            ".": new pulumi.asset.FileArchive(lambdaFunctionPath),
        }),
        environment: {
            variables: {
                GCP_CLIENT_EMAIL: serviceAccount.email,
                GCP_PRIVATE_KEY: serviceAccountKey.privateKey,
                GCP_BUCKET_NAME: gcsBucket.name,
                DYNAMO_DB_NAME: dynamoDBTable.name,
            }, 
        },
        timeout: 10,
        role: lambdaFunctionRole.arn,
    });
    
    const snsSubscription = new aws.sns.TopicSubscription("snsSubscription", {
        protocol: "lambda",
        endpoint: lambdaFunction.arn,
        topic: myTopic.arn,
    });

    const invokeLambdaForSNS = new aws.lambda.Permission("invokeLambdaForSNS", {
        action: "lambda:InvokeFunction",
        function: lambdaFunction.arn,
        principal: "sns.amazonaws.com",
    });

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

    const userDataScriptBase64 = pulumi.all([rdsInstance.dbName, rdsInstance.username, rdsInstance.password, rdsInstance.address, awsregion, myTopic.arn, snsAccessKeys.id, snsAccessKeys.secret]).apply(([dbName, username, password, host, region, topicarn, keyid, keysecret]) => {
        const userDataScript = `#!/bin/bash
            envFile="/opt/mywebappdir/.env"
            > "$envFile"
            echo "PGDATABASE=${dbName}" >> "$envFile"
            echo "PGUSER=${username}" >> "$envFile"
            echo "PGPASSWORD=${password}" >> "$envFile"
            echo "PGHOST=${host}" >> "$envFile"
            echo "PGPORT=5432" >> "$envFile"
            echo "AWSREGION=${region}" >> "$envFile"
            echo "SNSARN=${topicarn}" >> "$envFile"
            echo "AWSACCESSKEYID=${keyid}" >> "$envFile"
            echo "AWSACCESSSECRET=${keysecret}" >> "$envFile"
            sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
                -a fetch-config \
                -m ec2 \
                -c file:/opt/mywebappdir/cloudwatch_config.json \
                -s
            sudo systemctl daemon-reload
            sudo systemctl enable webapp
            sudo systemctl start webapp
        `;
    
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
 
    const clouldWatchAgentPolicyArn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy";
    const cloudWatchAgentServiceRolePolicyAttachment = new aws.iam.PolicyAttachment("cloudWatchAgentServiceRolePolicyAttachment", {
        policyArn: clouldWatchAgentPolicyArn,
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
        //userData: base64UserData,
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
        port: applicationPort,
        protocol: "HTTP",
        vpcId: main.id,
        healthCheck: {
            enabled: true,
            interval: healthCheckInterval,
            path: healthCheckPath,
            port: applicationPort,
            //protocol: "HTTP",
            timeout: healthCheckTimeout,
            healthyThreshold: healthyThreshold,
            unhealthyThreshold: unhealthyThreshold, 
            matcher: healthCheckMatcher,
        },
    });

    const autoScalingGroup = new aws.autoscaling.Group("myAutoScalingGroup", {
        minSize: minimumSize,
        maxSize: maximumSize,
        desiredCapacity: desiredCapacity,
        cooldown: cooldownPeriod,
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
        scalingAdjustment: scalingUpAdjustment,
        cooldown: cooldownPeriod
    });

    const scaleUpAlarm = new aws.cloudwatch.MetricAlarm("ScaleUpAlarm", {
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: evaluationPeriods,
        metricName: metricName,
        namespace: namespace,
        period: scaleUpPeriod,
        threshold: scaleUpThreshold,
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
        scalingAdjustment: scalingDownAdjustment,
        cooldown: cooldownPeriod
    });

    const scaleDownAlarm = new aws.cloudwatch.MetricAlarm("ScaleDownAlarm", {
        comparisonOperator: "LessThanThreshold",
        evaluationPeriods: evaluationPeriods,
        metricName: metricName,
        namespace: namespace,
        period: scaleDownPeriod,
        threshold: scaleDownThreshold,
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
