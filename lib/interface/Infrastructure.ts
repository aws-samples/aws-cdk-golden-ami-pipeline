import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface infrastructure {
        name?: string;
        instance_type?: ec2.InstanceType[];
        subnet_id?: ec2.ISubnet
        security_groups?: ec2.ISecurityGroup[];
}