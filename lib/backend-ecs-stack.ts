import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";
import * as iam from '@aws-cdk/aws-iam';

export class BackendEcsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stage = new cdk.CfnParameter(this, 'stage', {
      type: 'String',
      description: 'serverless stage name',
    }).valueAsString;
    const websocketAPIID = cdk.Fn.importValue(`gbraver-burst-serverless:${stage}:WebsoketApiId`);
    const connectionsTableARN = cdk.Fn.importValue(`gbraver-burst-serverless:${stage}:ConnectionsTableArn`);
    const casualMatchEntriesTableARN = cdk.Fn.importValue(`gbraver-burst-serverless:${stage}:CasualMatchEntriesTableArn`);
    const battlesTableARN = cdk.Fn.importValue(`gbraver-burst-serverless:${stage}:BattlesTableArn`);
    
    const vpc = new ec2.Vpc(this, "vpc", {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "isolated",
          subnetType: ec2.SubnetType.ISOLATED
        }
      ]
    });
    vpc.addInterfaceEndpoint("ecr-endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR
    });
    vpc.addInterfaceEndpoint("ecr-dkr-endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER
    });
    vpc.addInterfaceEndpoint("logs-endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS
    });
    vpc.addGatewayEndpoint("s3-endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{subnets: vpc.isolatedSubnets}]
    });
    vpc.addGatewayEndpoint('dynamo-db-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{subnets: vpc.isolatedSubnets}]
    });

    const matchMakeRepository = ecr.Repository.fromRepositoryName(this, "repo", "gbraver-burst-match-make");
    const matchMakePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          resources: [connectionsTableARN, casualMatchEntriesTableARN, battlesTableARN],
          actions: [
            'dynamodb:PutItem',
            'dynamodb:GetItem',
            'dynamodb:DeleteItem',
            'dynamodb:Scan',
            'dynamodb:BatchWrite*',
          ],
        })
      ],
    });
    const matchMakeServiceTaskRole = new iam.Role(this, 'match-make-service-task-role', {
      roleName: 'ecs-service-task-role',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {matchMakePolicy}
    });
    const taskDefinition = new ecs.TaskDefinition(this, "taskdef", {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: "256",
      memoryMiB: "512",
      taskRole: matchMakeServiceTaskRole
    });
    const logging = new ecs.AwsLogDriver({
      streamPrefix: "gbraver-burst-match-make",
    })
    taskDefinition.addContainer("demo-container", {
      image: ecs.ContainerImage.fromEcrRepository(matchMakeRepository),
      environment: {
        STAGE: stage,
        WEBSOCKET_API_ID: websocketAPIID,
      },
      logging,
    });
    const cluster = new ecs.Cluster(this, "cluster", { vpc });
    new ecs.FargateService(this, "service", {
      cluster,
      taskDefinition
    });
  }
}
