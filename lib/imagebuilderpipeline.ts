import { CfnResource, IResolvable, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ComponentConfig } from "./interface/componentConfig";
import { Distribution } from "./interface/distribution";
import path = require("path");
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IBucket, Bucket } from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as imagebuilder from "aws-cdk-lib/aws-imagebuilder";
import * as cdk from "aws-cdk-lib";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Infrastructure } from "./interface/infrastructureConfig"
import { Recipe } from "./interface/recipeConfig";
import { MainConfig } from "./interface/mainConfig";
import { Tags } from "./interface/tagInterfaces";

export interface ImageBuilderProps {
  userConfig: MainConfig
}

export interface ComponentList {
  componentArn: string;
  parameters?: {
    name: string;
    value: string[];
  }[];
}
export class ImagebuilderPipeline extends Construct implements MainConfig {
  amitag: Tags;
  tag: Tags;
  baseImage: cdk.aws_ec2.IMachineImage;
  amiComponentBucketName?: IBucket | undefined;
  amiComponentBucketCreate?: boolean | undefined;
  amiComponentBucketVersion?: boolean | undefined;
  imagePipelineName?: string | undefined;
  instanceProfileName?: string | undefined;
  instanceProfileRoleName?: string | undefined;
  iamEncryption?: boolean | undefined;
  componentsPrefix: string;
  keyAlias?: string | undefined;
  imageRecipe: Recipe;
  snsTopic?: cdk.aws_sns.ITopic | undefined;
  attribute?: string | undefined;
  schedule?: object | undefined;
  infrastructure?: Infrastructure | undefined;
  componentConfig: ComponentConfig;
  distributionConfig?: Distribution[] | undefined;
  distributionName?: string | undefined;
  distributionDescription?: string | undefined;
  resourceRemovalPolicy?: cdk.RemovalPolicy | undefined;
  defaultComponentConfig?: ComponentConfig

  public instanceProfileRole: iam.CfnInstanceProfile;
  public cmk: kms.Key
  public dist: imagebuilder.CfnDistributionConfiguration;
  public infra: imagebuilder.CfnInfrastructureConfiguration;
  public recipe: imagebuilder.CfnImageRecipe;
  public pipeline: imagebuilder.CfnImagePipeline;
  public bucket: IBucket;
  private componentArn: {
    arn: string;
    param?: { name: string; value: string[] }[] | undefined;
  }[] = [];
  private componentList: ComponentList[] = [];
  private componentBuild: imagebuilder.CfnComponent[] = [];
  private distribution: Distribution[] = [];

  constructor(scope: Construct, id: string, props: ImageBuilderProps) {
    super(scope, id);
    const {
      userConfig
    } = props;


    const attribute = userConfig['attribute'] ?? 'demo'
    let amiComponentBucketName = userConfig['amiComponentBucketName'] ?? undefined
    let bucketCreate = userConfig['amiComponentBucketCreate'] ?? true
    if (bucketCreate) {
      this.bucket = new Bucket(this, id, {
        versioned: userConfig['amiComponentBucketVersion'],
        bucketName: amiComponentBucketName?.bucketName,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED
      });
      this.bucket.addToResourcePolicy(new iam.PolicyStatement({
        actions: ['s3:Get*','s3:Put*','s3:List*'],
        resources: [`arn:aws:s3:::${this.bucket.bucketName}`,`arn:aws:s3:::${this.bucket.bucketName}/*`],
        principals: [new iam.AccountRootPrincipal()],
      }));
    }
    else {
      if (amiComponentBucketName === undefined) {
        throw new Error("amiComponentBucketName needs to provided")
      }
      else {
        console.log("bucket exists")
        this.bucket = Bucket.fromBucketName(
          this,
          'imported-bucket-from-name',
          amiComponentBucketName.bucketName,
        );
      }
    }
    const sourceAsset = Source.asset(userConfig['componentsPrefix']);
    const s3componentdeploy = new BucketDeployment(this, "DeployComponents", {
      sources: [sourceAsset],
      destinationBucket: this.bucket,
      destinationKeyPrefix: userConfig['componentsPrefix']
    });
    let defaultComponent = userConfig['defaultComponentConfig']
    if (defaultComponent) { this.addComponent(defaultComponent, this.bucket.bucketName, "Build", s3componentdeploy); }
    this.addComponent(userConfig["componentConfig"], this.bucket.bucketName, "Build", s3componentdeploy);
    this.addComponent(userConfig["componentConfig"], this.bucket.bucketName, "Test", s3componentdeploy);
    if (defaultComponent) { this.addComponent(defaultComponent, this.bucket.bucketName, "Test", s3componentdeploy); }


    this.componentBuild.forEach((value) => {
      if (userConfig['resourceRemovalPolicy'] === "destroy") {
        value.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)
      }
      else {
        value.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      }
    });

    let compList: ComponentList = { componentArn: "" };
    this.componentArn.forEach((value) => {
      compList.componentArn = value.arn;
      if (value.param) compList.parameters = value.param;
      this.componentList.push(compList);
      compList = { componentArn: "" };
    });

    const baseArn = userConfig['baseImage'].getImage(this).imageId

    const instanceProfileName = userConfig['instanceProfileName'] ?? `golden-ami-instance-profile-${attribute}`
    const instanceProfileRoleName = userConfig['instanceProfileRoleName'] ?? undefined


    this.instanceProfileRole = this.createInstanceProfileRole(
      this.bucket.bucketName,
      instanceProfileRoleName,
      instanceProfileName
    );

    let distArn = undefined
    if (userConfig['amitag']) { this.amitag = userConfig['amitag'] }
    if (userConfig['tag']) { this.tag = userConfig['tag'] }

    if (userConfig["distributionConfig"]) {
      this.distribution = userConfig["distributionConfig"];
      let distributionName = userConfig['distributionName'] ?? `golden-ami-distribution-${attribute}`
      let distributionDesc = userConfig['distributionDescription'] ?? `Destribution settings for ${attribute}`
      this.dist = this.createDistribution(this.distribution, this.amitag, this.tag, distributionName, distributionDesc);
      distArn = this.dist.attrArn
    }

    const keyAlias = userConfig['keyAlias'] ?? undefined
    let keyid

    if (userConfig['iamEncryption'] === undefined) {
      keyid = undefined
    }
    else{
      if (userConfig.iamEncryption){
        this.cmk = this.createKMSKey(this.distribution, keyAlias);
        keyid = this.cmk.keyId
      }
      else {
        keyid = undefined
      }
    }
    this.recipe = this.buildRecipe(
      baseArn,
      userConfig,
      keyid,
      this.componentList,
      attribute
    );

    this.infra = this.createInfra(
      this.instanceProfileRole,
      userConfig,
      attribute
    )
    this.infra.addDependsOn(this.instanceProfileRole);
    const imagepipelinename = userConfig['imagePipelineName'] ?? `golden-ami-pipeline-${attribute}`

    this.pipeline = this.createImagePipeline(
      this.recipe,
      distArn,
      this.infra.attrArn,
      imagepipelinename,
      userConfig['schedule']
    );
    this.pipeline.addDependsOn(this.infra);
  }
  private createImagePipeline(
    imageRecipe: imagebuilder.CfnImageRecipe,
    dist: string | undefined,
    infra: string,
    name: string,
    schedule: object | undefined
  ): imagebuilder.CfnImagePipeline {
    try {
      const pipeline = new imagebuilder.CfnImagePipeline(
        this,
        "Golden_AMI_Pipeline",
        {
          name: name,
          imageRecipeArn: imageRecipe.attrArn,
          infrastructureConfigurationArn: infra,
          distributionConfigurationArn: dist,
          schedule: schedule
        }
      );
      return pipeline;
    } catch (error) {
      throw new Error("Error creating pipeline");
    }
  }
  private createInfra(
    instanceprofile: iam.CfnInstanceProfile,
    userConfig: MainConfig,
    attribute: string
  ): imagebuilder.CfnInfrastructureConfiguration {
    if (userConfig["infrastructure"] === undefined ){
      userConfig["infrastructure"] = {}
    }
    const instanceType = userConfig["infrastructure"]["instanceType"]
    const securityGroup = userConfig["infrastructure"]["securityGroups"]

    
    try {
      const infraconfig = new imagebuilder.CfnInfrastructureConfiguration(
        this,
        "Golden_AMI_Instance_Infra",
        {
          name: userConfig["infrastructure"]["name"] ?? `golden-ami-infra-${attribute}`,
          //instanceTypes: ["t2.large"],
          instanceTypes: instanceType!?.map(instanceType => instanceType?.toString()!),
          instanceProfileName: instanceprofile.instanceProfileName!,
          subnetId: userConfig["infrastructure"]["subnetId"]?.subnetId,
          securityGroupIds: securityGroup!?.map(securityGroup => securityGroup.securityGroupId?.toString()!),
          snsTopicArn: userConfig["snsTopic"]?.topicArn
        }
      );
      return infraconfig;
    } catch (error) {
      console.log(error)
        console.log(error)
        throw new Error("Error creating infra config");
    }
  }
  
  private createDistribution(
    distribution: Distribution[],
    amitag: Tags | undefined,
    tag: object | undefined,
    name: string,
    description: string | undefined
  ): imagebuilder.CfnDistributionConfiguration {
    let distributionsList: imagebuilder.CfnDistributionConfiguration.DistributionProperty[] =
      [];
    distribution.forEach((value) => {
      const amiDistributionConfiguration: imagebuilder.CfnDistributionConfiguration.AmiDistributionConfigurationProperty =
      {
        amiTags: amitag,
        targetAccountIds: value.accounts,
      };
      const distributionProperty: imagebuilder.CfnDistributionConfiguration.DistributionProperty =
      {
        region: value.region,
        amiDistributionConfiguration: amiDistributionConfiguration,
      };
      distributionsList.push(distributionProperty);
    });
    try {
      let cfnDistributionConfiguration =
        new imagebuilder.CfnDistributionConfiguration(
          this,
          "MyCfnDistributionConfiguration",
          {
            distributions: distributionsList,
            tags: tag as { [key: string]: string; },
            name: name,
            description: description,
          }
        );
      return cfnDistributionConfiguration;
    } catch (error) {
      throw new Error("Error creating pipeline");
    }
  }
  private buildRecipe(
    baseArn: string,
    userConfig: MainConfig,
    keyid: string | undefined,
    componentList: ComponentList[],
    attribute: string
  ): imagebuilder.CfnImageRecipe {
    let encryptionNeeded: boolean
    if (keyid === undefined) {
      encryptionNeeded = false
    }
    else {
      encryptionNeeded = true
    }
    const encryption = keyid ?? false
    const recipe = new imagebuilder.CfnImageRecipe(this, "ImageRecipe", {
      name: userConfig["imageRecipe"]["imageRecipeName"] ?? `golden-ami-recipe-${attribute}`,
      version: userConfig["imageRecipe"]["imageRecipeVersion"],
      components: componentList,
      parentImage: baseArn,
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            deleteOnTermination: userConfig["imageRecipe"]['deleteOnTermination'],
            encrypted: encryptionNeeded,
            kmsKeyId: keyid,
            volumeSize: userConfig["imageRecipe"]["volumeSize"],
            volumeType: userConfig["imageRecipe"]["volumeType"]
          },
        },
      ],
    });
    if (userConfig['resourceRemovalPolicy'] === "destroy") {
      recipe.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
    else {
      recipe.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    }
    return recipe;
  }
  private createInstanceProfileRole(
    bucketName: string,
    instanceProfileRoleName: string | undefined,
    instanceProfileName: string

  ): iam.CfnInstanceProfile {
    const role = new iam.Role(this, "Golden_AMI_Instance_Profile_Role", {
      roleName: instanceProfileRoleName,
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "EC2InstanceProfileForImageBuilder"
      )
    );
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonInspectorFullAccess")
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:CreateTags"],
        resources: [`arn:aws:ec2:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:*/*`]
      })
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:Get*",
          "s3:Delete*",
          "s3:Create*",
          "s3:Update*",
          "s3:List*",
          "s3:Put*",
        ],
        resources: [
          `arn:aws:s3:::${bucketName}`,
          `arn:aws:s3:::${bucketName}/*`,
        ],
      })
    );

    const instanceprofile = new iam.CfnInstanceProfile(
      this,
      "Golden_AMI_Instanc_Profile",
      {
        instanceProfileName: instanceProfileName,
        roles: [role.roleName],
      }
    );
    return instanceprofile;
  }

  private createKMSKey(dist: Distribution[] | undefined, alias: string | undefined): kms.Key {
    const cmk = new kms.Key(this, "Golden_AMI_Encryption_Key", {
      alias: alias,
      enableKeyRotation: true,
    });

    cmk.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:Generate*",
          "kms:ReEncrypt*",
          "kms:CreateGrant",
          "kms:DescribeKey",
        ],
        principals: [new iam.AccountRootPrincipal()],
        conditions: {
          StringLike: {
            "aws:PrincipalArn": `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/aws-service-role/imagebuilder.amazonaws.com/AWSServiceRoleForImageBuilder`,
          },
        },
        resources: ["*"],
      })
    );
    if (dist) {
      dist.forEach((value) => {
        value.accounts.forEach((account) => {
          cmk.addToResourcePolicy(
            new iam.PolicyStatement({
              actions: [
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:Generate*",
                "kms:ReEncrypt*",
                "kms:CreateGrant",
                "kms:DescribeKey",
              ],
              principals: [new iam.AccountPrincipal(account)],
              conditions: {
                StringLike: {
                  "aws:PrincipalArn": `arn:aws:iam::${account}:role/EC2ImageBuilderDistributionCrossAccountRole`,
                },
              },
              resources: ["*"],
            })
          );
        });
      })
    }
    return cmk;
  }
  private addComponent(
    config: ComponentConfig,
    bucketName: string,
    componentType: string,
    bDeploy: BucketDeployment

  ) {
    let buildType: any = "";

    if (componentType === "Build") buildType = "Build";
    else if (componentType === "Test") buildType = "Test";

    if (buildType in config) {
      const cfg = config[buildType as keyof typeof config];

      cfg!.forEach((value) => {
        const arn = value.arn;
        if (value.arn) {
          if ("parameter" in value) {
            this.componentArn.push({
              arn: arn!,
              param: value.parameter!,
            });
          } else {
            this.componentArn.push({ arn: arn! });
          }
        } else if (value.file) {
          const uri = `s3://${bucketName}/${value.file}`;
          const imageBuild = new imagebuilder.CfnComponent(
            this,
            `${value.name}-${buildType}`,
            {
              name: value.name as string,
              platform: "Linux",
              version: value.version!,
              uri,
            }
          );
          imageBuild.node.addDependency(bDeploy)
          this.componentBuild.push(imageBuild);

          if ("parameter" in value) {
            this.componentArn.push({
              arn: this.componentBuild.slice(-1)[0].attrArn,
              param: value.parameter!,
            });
          } else {
            this.componentArn.push({
              arn: this.componentBuild.slice(-1)[0].attrArn,
            });
          }
        }
      });
    }
  }
}
