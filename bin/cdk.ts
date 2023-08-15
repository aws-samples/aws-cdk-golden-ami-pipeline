import * as cdk from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import { ImagebuilderPipeline } from './../lib/imagebuilderpipeline'
import { MainConfig } from './../lib/interface/mainConfig'
import * as sns from "aws-cdk-lib/aws-sns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
const app = new cdk.App();

// const ami_config: MainConfing = user_config;

// const tag: cdk.Tag = {
//   "env": "dev",
//   "Name": "golden-ami-blog-demo"
// }
const tag_env = new cdk.Tag('env', 'dev');
const tag_name = new cdk.Tag('Name', 'golden-ami-blog-demo');

export class createImageBuilder extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ami_config: MainConfig = {
      "default_Component_Config": {
        "Build": [
          {
            "arn": "arn:aws:imagebuilder:us-east-1:aws:component/update-linux/1.0.2/1"
          }
        ],
        "Test": [
          {
            "arn": "arn:aws:imagebuilder:us-east-1:aws:component/reboot-test-linux/1.0.0/1"
          }
        ]
      },
      "baseImage": ec2.MachineImage.latestAmazonLinux(),
      "baseImageType": "id",
      "ami_component_bucket_name": s3.Bucket.fromBucketName(this, 'MyBucket', "golden-ami-bucket-20230802-1"),
      "ami_component_bucket_create": true,
      "attr": "blog-demo",
      "sns_topic": sns.Topic.fromTopicArn(this, 'MyTopic', "arn:aws:sns:us-east-1:993348658863:test"),
      "imagePipelineName": "golden-ami-recipe-blog-demo",
      "components_prefix": "components",
      "instanceProfileName": "golden-ami-instance-profile-blog-demo",
      "instanceProfileRoleName": "golden-ami-instance-profile-role-blog-demo",
      "iamEncryption": false,
      "schedule": {
        "scheduleExpression": "cron(0 10 * * ? *)"
      },
      "amitag": {
        "env": "dev",
        "Name": "golden-ami-{{imagebuilder:buildDate}}",
        "Date_Created": "{{imagebuilder:buildDate}}"
      },
      "tag": {
        "env": "dev",
        "Name": "golden-ami-blog-demo"
      },
      "image_recipe": {
        "image_recipe_version": "1.0.2",
        "image_recipe_name": "golden-ami-recipe-blog-demo",
        "volume_size": 2048,
        "volume_type": "gp2",
        "deleteOnTermination": true
      },
      "infrastructure": {
        "name": "golden-ami-infra-blog-demo",
        "instance_type": [
          ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.LARGE),
          ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.SMALL)
        ],
        "subnet_id": ec2.Subnet.fromSubnetId(this,'subnet-name', "subnet-9ebb61f8"),
        "security_groups": [
          ec2.SecurityGroup.fromSecurityGroupId(this,'sg-name', "sg-00be3805ab84f7567")
        ]
      },
      "Component_Config": {
        "Build": [
          {
            "name": "build1",
            "file": "components/build1.yaml",
            "version": "1.0.0",
            "parameter": [
              {
                "name": "testparam",
                "value": [
                  "samplevalue"
                ]
              }
            ]
          }
        ],
        "Test": [
          {
            "name": "test1",
            "file": "components/test1.yaml",
            "version": "1.0.0"
          }
        ]
      },
      "Distribution": [
        {
          "region": "us-east-1",
          "accounts": [
            "107703766638"
          ]
        }
      ],
      "distributionName": "golden-ami-distribution-blog-demo",
      "distributionDescription": "Distribution settings for Golden AMI Pipeline",
      "resource_removal_policy": cdk.RemovalPolicy.DESTROY
    }

    const Golden_AMI_Pipeline = new ImagebuilderPipeline(this, "ImagebuilderPipeline", {
      user_config: ami_config
    });
    new cdk.CfnOutput(this, 'S3bucketName', { value: Golden_AMI_Pipeline.bucket.bucketName });
    new cdk.CfnOutput(this, 'PipelineName', { value: Golden_AMI_Pipeline.pipeline.name });
    new cdk.CfnOutput(this, 'ImageRecipeName', { value: Golden_AMI_Pipeline.recipe.name });
    new cdk.CfnOutput(this, 'ImagePipelineInfraName', { value: Golden_AMI_Pipeline.infra.name });
    new cdk.CfnOutput(this, 'AMIInstanceProfile', { value: Golden_AMI_Pipeline.instance_profile_role.instanceProfileName! });

  }
}
const stack = new createImageBuilder(app, "ImagebuilderPipeline", {
  env: {
    region: process.env.CDK_DEPLOY_REGION
  }
}
)
cdk.Tags.of(stack).add(tag_env.key,tag_env.value)
cdk.Tags.of(stack).add(tag_name.key,tag_name.value)
app.synth();