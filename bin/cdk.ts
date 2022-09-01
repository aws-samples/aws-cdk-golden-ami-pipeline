#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import user_config from "./config.json";
import default_component from "./default_component.json";
import { Stack } from "aws-cdk-lib";
import {ImagebuilderPipeline, MainConfing} from 'golden_ami_pipeline';


const app = new cdk.App();
const ami_config: MainConfing = user_config;

const mystack = new Stack()

export class createImageBuilder extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const Golden_AMI_Pipeline = new ImagebuilderPipeline(this, "ImagebuilderPipeline", {
      user_config: ami_config,
      mandatory_component: default_component
    });
}
}
const imagepipeline = new createImageBuilder(app, "ImagebuilderPipeline", {
  env: {
    region: process.env.CDK_DEPLOY_REGION
  },
  tags: ami_config['tag'] as { [key: string]: string; }
}

)
app.synth();
