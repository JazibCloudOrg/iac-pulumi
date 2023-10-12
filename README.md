# iac-pulumi
## Introduction
# Pulumi: Infrastructure as Code
Pulumi is a powerful and flexible Infrastructure as Code (IaC) tool that enables you to define, deploy, and manage your cloud infrastructure using familiar programming languages. With Pulumi, you can take full advantage of your existing development skills to create, update, and maintain cloud resources, applications, and more. Say goodbye to configuration files and hello to expressive, maintainable infrastructure code.

## Prerequisites

1.Visual studio code (IDE)

2.Pulumi CLI

3.AWS Account

4.AWS CLI


<h4>Important Commands to configure and run the project</h4>

## Scripts/Commands
- `brew install pulumi/tap/pulumi`: to install pulumi in your machine
- `pulumi new`: to create a new pulumi project
- `pulumi up`: to start pulumi project and created resource in AWS
- `pulumi up --config "aws:region=us-east-1"`: to start pulumi project with user defined region
- `pulumi destroy`: to delete resource in AWS
- `which pulumi`: to check pulumi path in your machine
- `aws --version`: to check what version of aws cli is installed in your machine
- `aws configure --profile`: to configure aws account in aws cli

<h4>Instructions</h4>
Step 1: Clone the repository or download and unzip the source repository.

Step 2: Make sure you have pulumi installed in your machine. Use the above commands to check pulumi in your machine or install it.

Step 3: Create appropriate files in the IDE and install all dependencies.

Step 4: Configure AWS CLI in your local using <b>aws configure --profile</b>.

Step 5: Run <b>pulumi up</b> to start the project.

Step 6: Check the AWS account to see the resources created.