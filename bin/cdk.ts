import * as cdk from "aws-cdk-lib";
import user_config from "./config_with_only_mandatory_param.json";
import default_component from "./default_component.json";
import { Stack } from "aws-cdk-lib";
import { ImagebuilderPipeline } from './../lib/imagebuilderpipeline'
import { MainConfing } from './../lib/interface/mainConfig'

const app = new cdk.App();
const ami_config: MainConfing = user_config;

export class createImageBuilder extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
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
new createImageBuilder(app, "ImagebuilderPipeline", {
  env: {
    region: process.env.CDK_DEPLOY_REGION
  },
  tags: ami_config['tag'] as { [key: string]: string; }
}
)
app.synth();
