import { ComponentConfig } from "./component_config";
import { distribution } from "./distribution";
import { infrastructure } from "./Infrastructure";
import { Recipe } from "./Recipe";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";
export interface MainConfing {
  baseImage: ec2.IMachineImage
  baseImageType?: string;
  ami_component_bucket_name?: s3.IBucket;
  ami_component_bucket_create?: boolean;
  ami_component_bucket_version?: boolean;
  imagePipelineName?: string;
  instanceProfileName?: string;
  instanceProfileRoleName?: string;
  iamEncryption?: boolean;
  components_prefix: string;
  key_alias?: string;
  image_recipe: Recipe;
  sns_topic?: sns.ITopic
  attr?: string
  amitag?: object;
  tag?: object;
  schedule?: object;
  infrastructure?: infrastructure;
  Component_Config: ComponentConfig;
  Distribution?: distribution[];
  distributionName?: string;
  distributionDescription?: string;
  resource_removal_policy?: cdk.RemovalPolicy
}
