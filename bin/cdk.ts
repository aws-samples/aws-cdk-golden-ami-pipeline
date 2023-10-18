import * as cdk from "aws-cdk-lib";
import { Stack } from "aws-cdk-lib";
import { ImagebuilderPipeline } from './../lib/imagebuilderpipeline'
import { MainConfig } from './../lib/interface/mainConfig'

// The following imports are needed when you set the props
//import * as ec2 from "aws-cdk-lib/aws-ec2";
//import * as s3 from "aws-cdk-lib/aws-s3";
//import * as sns from "aws-cdk-lib/aws-sns";

const app = new cdk.App();
// You can use this variable for your props or you can directly pass them to the class. There are two examples in the "example_props" folder
let amiConfig: MainConfig

const tagEnv = new cdk.Tag('env', 'dev');
const tagName = new cdk.Tag('Name', 'golden-ami-blog-demo');

export class CreateImageBuilder extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // Props can be passed using ami_config variable. For example, refer to the folder `example_props`
   
    const GOLDEN_AMI_PIPELINE = new ImagebuilderPipeline(this, "ImagebuilderPipeline", {
      userConfig: amiConfig!
    });
    new cdk.CfnOutput(this, 'S3bucketName', { value: GOLDEN_AMI_PIPELINE.bucket.bucketName });
    new cdk.CfnOutput(this, 'PipelineName', { value: GOLDEN_AMI_PIPELINE.pipeline.name });
    new cdk.CfnOutput(this, 'ImageRecipeName', { value: GOLDEN_AMI_PIPELINE.recipe.name });
    new cdk.CfnOutput(this, 'ImagePipelineInfraName', { value: GOLDEN_AMI_PIPELINE.infra.name });
    new cdk.CfnOutput(this, 'AMIInstanceProfile', { value: GOLDEN_AMI_PIPELINE.instanceProfileRole.instanceProfileName! });

  }
}
const stack = new CreateImageBuilder(app, "ImagebuilderPipeline", {
  env: {
    region: process.env.CDK_DEPLOY_REGION
  }
}
)
cdk.Tags.of(stack).add(tagEnv.key,tagEnv.value)
cdk.Tags.of(stack).add(tagName.key,tagName.value)
app.synth();