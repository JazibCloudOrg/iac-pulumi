const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

const vpcCidrBlock = new pulumi.Config("myVPCModule").require("vpcCidrBlock");
const destinationCidrBlock = new pulumi.Config("myVPCModule").require("destinationCidrBlock");
const subnetSize = new pulumi.Config("myVPCModule").require("subnetSize");
const subnetCidrPrefix = new pulumi.Config("myVPCModule").require("subnetCidrPrefix");


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

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("application-security-group", {
        description: "Security group for web applications",
        vpcId: main.id, // Replace with your VPC ID
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

    const InternetGatewayAttachment = new aws.ec2.InternetGatewayAttachment("InternetGatewayAttachment", {
        internetGatewayId: gw.id,
        vpcId: main.id,
    });

    //const availabilityZones = ['us-east-1a', 'us-east-1b', 'us-east-1c'];

    const publicRouteTable = new aws.ec2.RouteTable('public-route-table', {
        vpcId: main.id, // Use your VPC ID
        tags: {
            Name: 'public-route-table',
        },
    });

    const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
        vpcId: main.id, // Use the VPC ID of your existing VPC
        tags: {
        Name: "private-route-table",
        },
    });

    const publicRoute = new aws.ec2.Route('public-route', {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: destinationCidrBlock, // Send all traffic to the internet
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
            selectedSubnet = publicSubnet; // Select the first subnet or any specific subnet you want
        }

            const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
            vpcId: main.id,
            cidrBlock: generateRandomCIDRBlock(),
            availabilityZone: zones[i],
            tags: {
                Name: `private-subnet-${i}`,
            },
        });

        new aws.ec2.RouteTableAssociation(`public-subnet-association-${i}`, {
            subnetId: publicSubnet.id,
            routeTableId: publicRouteTable.id,
        });

        new aws.ec2.RouteTableAssociation(`private-subnet-association-${i}`, {
            subnetId: privateSubnet.id,
            routeTableId: privateRouteTable.id,
        });
    }

    const ec2Instance = new aws.ec2.Instance("myEC2Instance", {
        ami: "ami-05a310802b431acb8", // Specify the desired Amazon Machine Image (AMI)
        instanceType: "t2.micro", // Choose the instance type as per your requirement
        vpcSecurityGroupIds: [applicationSecurityGroup.id], // Attach the application security group
        subnetId: selectedSubnet.id, // Specify the subnet where you want to launch the instance
        keyName: "mykeypair", // Specify the SSH key pair to use for access
        associatePublicIpAddress: true, // Assign a public IP address for internet access
        disableApiTermination: false,
        tags: {
            Name: "MyEC2Instance", // Add any desired tags
        },
        rootBlockDevice: {
            volumeSize: 25, // Size of the root EBS volume (in GB)
            volumeType: "gp2",
            deleteOnTermination: true, // Ensure the volume is deleted when the instance is terminated
        },
    });
}).catch((error) => {
    console.error(error);
});
