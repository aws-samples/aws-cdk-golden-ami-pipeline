import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface Infrastructure {
        name?: string;
        instanceType?: ec2.InstanceType[];
        subnetId?: ec2.ISubnet
        securityGroups?: ec2.ISecurityGroup[];
}