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
    // Props can be passed using ami_config variable. For example, refer to the folder `example_props`
    let ami_config: MainConfig 

    const Golden_AMI_Pipeline = new ImagebuilderPipeline(this, "ImagebuilderPipeline", {
      user_config: ami_config!
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