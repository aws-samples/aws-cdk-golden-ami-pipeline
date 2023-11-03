import { ComponentConfig } from "./componentConfig";
import { Distribution } from "./distribution";
import { Infrastructure } from "./infrastructureConfig";
import { Recipe } from "./recipeConfig";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cdk from "aws-cdk-lib";
import { Tags } from "./tagInterfaces";

export interface MainConfig {
  baseImage: ec2.IMachineImage
  amiComponentBucketName?: s3.IBucket;
  amiComponentBucketCreate?: boolean;
  amiComponentBucketVersion?: boolean;
  imagePipelineName?: string;
  instanceProfileName?: string;
  instanceProfileRoleName?: string;
  iamEncryption?: boolean;
  componentsPrefix: string;
  keyAlias?: string;
  imageRecipe: Recipe;
  snsTopic?: sns.ITopic
  attribute?: string;
  amitag?: Tags;
  tag?: Tags;
  schedule?: object;
  infrastructure?: Infrastructure;
  componentConfig: ComponentConfig;
  distributionConfig?: Distribution[];
  distributionName?: string;
  distributionDescription?: string;
  resourceRemovalPolicy?: cdk.RemovalPolicy;
  defaultComponentConfig?: ComponentConfig
}






