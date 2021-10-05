import * as cdk from '@aws-cdk/core';
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as ecr from "@aws-cdk/aws-ecr";

export class BackendEcsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stage = new cdk.CfnParameter(this, 'stage', {
      type: 'String',
      description: 'serverless stage name',
    });
    const websocketAPIID = new cdk.CfnParameter(this, 'websocketAPIID', {
      type: 'String',
      description: 'websocker api gateway id',
    });

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
    vpc.addInterfaceEndpoint("ws-api-gateway-endpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY
    });
    vpc.addGatewayEndpoint("s3-endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{subnets: vpc.isolatedSubnets}]
    });
    vpc.addGatewayEndpoint('dynamo-db-endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{subnets: vpc.isolatedSubnets}]
    });

    const repo = ecr.Repository.fromRepositoryName(this, "repo", "gbraver-burst-match-make")

    const cluster = new ecs.Cluster(this, "cluster", { vpc })
    const taskDefinition = new ecs.TaskDefinition(this, "taskdef", {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: "256",
      memoryMiB: "512",
    });
    const logging = new ecs.AwsLogDriver({
      streamPrefix: "gbraver-burst-match-make",
    })
    taskDefinition.addContainer("demo-container", {
      image: ecs.ContainerImage.fromEcrRepository(repo),
      environment: {
        STAGE: stage.valueAsString,
        WEBSOCKET_API_ID: websocketAPIID.valueAsString,
      },
      logging
    });
    new ecs.FargateService(this, "service", {
      cluster,
      taskDefinition
    });
  }
}
