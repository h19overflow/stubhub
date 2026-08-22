import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const operatorCidr = config.require("operatorCidr");
const kubernetesVersion = config.get("kubernetesVersion") ?? "1.36";
const clusterName = "stubhub-dev";
const tags = {
  Project: "stubhub",
  Environment: pulumi.getStack(),
  ManagedBy: "Pulumi",
};

// Hierarchy: VPC -> two public subnets -> EKS control plane -> one Spot worker.
// Public subnets avoid a NAT Gateway's hourly charge. This is a learning setup,
// not a production high-availability network.
const network = new awsx.ec2.Vpc("network", {
  cidrBlock: "10.20.0.0/16",
  numberOfAvailabilityZones: 2,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,
  subnetSpecs: [
    {
      name: "public",
      type: awsx.ec2.SubnetType.Public,
      cidrMask: 24,
      tags: {
        [`kubernetes.io/cluster/${clusterName}`]: "shared",
        "kubernetes.io/role/elb": "1",
      },
    },
  ],
  natGateways: {
    strategy: awsx.ec2.NatGatewayStrategy.None,
  },
  tags,
});

// The operator reaches the public endpoint from one CIDR; workers use the
// private endpoint so their changing public addresses never need allowlisting.
const cluster = new eks.Cluster("cluster", {
  name: clusterName,
  version: kubernetesVersion,
  vpcId: network.vpcId,
  publicSubnetIds: network.publicSubnetIds,
  endpointPublicAccess: true,
  endpointPrivateAccess: true,
  publicAccessCidrs: [operatorCidr],
  authenticationMode: "API",
  skipDefaultNodeGroup: true,
  createInstanceRole: false,
  useDefaultVpcCni: true,
  deletionProtection: false,
  tags,
});

const nodeRole = new aws.iam.Role("node-role", {
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        effect: "Allow",
        actions: ["sts:AssumeRole"],
        principals: [{ type: "Service", identifiers: ["ec2.amazonaws.com"] }],
      },
    ],
  }).json,
  tags,
});

const workerPolicy = new aws.iam.RolePolicyAttachment("worker-policy", {
  role: nodeRole.name,
  policyArn: aws.iam.ManagedPolicy.AmazonEKSWorkerNodePolicy,
});

const registryPolicy = new aws.iam.RolePolicyAttachment("registry-policy", {
  role: nodeRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
});

// ponytail: node-level CNI permissions keep the first cluster understandable;
// move this policy to the aws-node service account before production use.
const cniPolicy = new aws.iam.RolePolicyAttachment("cni-policy", {
  role: nodeRole.name,
  policyArn: aws.iam.ManagedPolicy.AmazonEKS_CNI_Policy,
});

const nodeGroup = new eks.ManagedNodeGroup(
  "spot-node",
  {
    cluster,
    nodeRole,
    subnetIds: network.publicSubnetIds,
    capacityType: "SPOT",
    instanceTypes: ["t3a.small"],
    amiType: "AL2023_x86_64_STANDARD",
    diskSize: 20,
    enableIMDSv2: true,
    scalingConfig: {
      desiredSize: 1,
      minSize: 1,
      maxSize: 1,
    },
    labels: {
      workload: "learning",
      capacity: "spot",
    },
    tags,
  },
  { dependsOn: [workerPolicy, registryPolicy, cniPolicy] },
);

export const eksClusterName = cluster.eksCluster.name;
export const eksNodeGroupName = nodeGroup.nodeGroup.nodeGroupName;
export const vpcId = network.vpcId;
export const publicSubnetIds = network.publicSubnetIds;
export const kubeconfig = pulumi.secret(cluster.kubeconfig);
