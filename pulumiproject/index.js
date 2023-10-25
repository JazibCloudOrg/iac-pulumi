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


    const applicationSecurityGroup = new aws.ec2.SecurityGroup("application-security-group", {
        description: "Security group for web applications",
        vpcId: main.id,
    });

    const ingressRules = [
        { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] }, // SSH
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }, // HTTP
        { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] }, // HTTPS
        { protocol: "tcp", fromPort: 8080, toPort: 8080, cidrBlocks: ["0.0.0.0/0"] }
    ];

    for (const rule of ingressRules) {
        new aws.ec2.SecurityGroupRule(`ingress-${rule.fromPort}`, {
            type: "ingress",
            fromPort: rule.fromPort,
            toPort: rule.toPort,
            protocol: rule.protocol,
            securityGroupId: applicationSecurityGroup.id,
            cidrBlocks: rule.cidrBlocks,
        });
    }

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

    const userDataScript = pulumi.all([rdsInstance.dbName, rdsInstance.username, rdsInstance.password, rdsInstance.address]).apply(([dbName, username, password, host]) => {
        return `#!/bin/bash
        envFile="/opt/mywebappdir/.env"
        > "$envFile"
        echo "PGDATABASE=${dbName}" >> "$envFile"
        echo "PGUSER=${username}" >> "$envFile"
        echo "PGPASSWORD=${password}" >> "$envFile"
        echo "PGHOST=${host}" >> "$envFile"
        echo "PGPORT=5432" >> "$envFile"
        sudo systemctl daemon-reload
        sudo systemctl enable webapp
        sudo systemctl start webapp
        `;
    });

    const ami = aws.ec2.getAmi({
        mostRecent: true,
        filters: [
            { name: "name", values: ["my-ami-node*"] },
        ],
    });
    
    const amiId = ami.then(ami => ami.id);

    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        ami: amiId,
        instanceType: ec2instanceType,
        vpcSecurityGroupIds: [applicationSecurityGroup.id],
        subnetId: selectedSubnet.id,
        keyName: ec2keyName,
        //associatePublicIpAddress: true,
        disableApiTermination: false,
        userData: userDataScript,
        tags: {
            Name: "MyEC2Instance",
        },
        rootBlockDevice: {
            volumeSize: ec2volumneSize,
            volumeType: ec2volumeType,
            deleteOnTermination: true,
        },
    });
}).catch((error) => {
    console.error(error);
});
