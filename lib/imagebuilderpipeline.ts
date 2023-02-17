import { CfnResource, IResolvable, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MainConfing } from "./interface/MainConfig";
import { ComponentConfig } from "./interface/Component_config";
import { distribution } from "./interface/Distribution";
import path = require("path");
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { IBucket, Bucket } from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as imagebuilder from "aws-cdk-lib/aws-imagebuilder";
import * as cdk from "aws-cdk-lib";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";

export interface ImageBuilderProps {
  user_config: MainConfing
  default_component?: ComponentConfig
}

export interface component_list {
  componentArn: string;
  parameters?: {
    name: string;
    value: string[];
  }[];
}

export class ImagebuilderPipeline extends Construct {
  private amitag: object;
  private tag: object;
  public instance_profile_role: iam.CfnInstanceProfile;
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
  private component_list: component_list[] = [];
  private component_build: imagebuilder.CfnComponent[] = [];
  private distribution: distribution[] = [];

  constructor(scope: Construct, id: string, props: ImageBuilderProps) {
    super(scope, id);
    const {
      user_config,
      default_component
    } = props;

    const attr = user_config['attr'] ?? 'demo'
    const ami_component_bucket_name = user_config['ami_component_bucket_name'] ?? undefined
    const bucket_create = user_config['ami_component_bucket_create'] ?? true
    if (bucket_create) {
      this.bucket = new Bucket(this, id, {
        versioned: user_config['ami_component_bucket_version'],
        bucketName: ami_component_bucket_name,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED
      });
      this.bucket.addToResourcePolicy(new iam.PolicyStatement({
        actions: ['s3:Get*','s3:Put*','s3:List*'],
        resources: [`arn:aws:s3:::${this.bucket.bucketName}`,`arn:aws:s3:::${this.bucket.bucketName}/*`],
        principals: [new iam.AccountRootPrincipal()],
      }));
    }
    else {
      if (ami_component_bucket_name === undefined) {
        throw new Error("ami_component_bucket_name needs to provided")
      }
      else {
        console.log("bucket exists")
        this.bucket = Bucket.fromBucketName(
          this,
          'imported-bucket-from-name',
          ami_component_bucket_name,
        );
      }
    }
    const source_asset = Source.asset(user_config['components_prefix']);
    const s3componentdeploy = new BucketDeployment(this, "DeployComponents", {
      sources: [source_asset],
      destinationBucket: this.bucket,
      destinationKeyPrefix: user_config['components_prefix']
    });

    if (default_component) { this.AddComponent(default_component, this.bucket.bucketName, "Build", s3componentdeploy); }
    this.AddComponent(user_config["Component_Config"], this.bucket.bucketName, "Build", s3componentdeploy);
    this.AddComponent(user_config["Component_Config"], this.bucket.bucketName, "Test", s3componentdeploy);
    if (default_component) { this.AddComponent(default_component, this.bucket.bucketName, "Test", s3componentdeploy); }


    this.component_build.forEach((value) => {
      if (user_config['resource_removal_policy'] === "destroy") {
        value.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)
      }
      else {
        value.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      }
    });

    let comp_list: component_list = { componentArn: "" };
    this.componentArn.forEach((value) => {
      comp_list.componentArn = value.arn;
      if (value.param) comp_list.parameters = value.param;
      this.component_list.push(comp_list);
      comp_list = { componentArn: "" };
    });

    let base_arn: string = "";
    if (user_config["baseImageType"] === "ssm") {
      base_arn = ssm.StringParameter.fromStringParameterAttributes(this, "existingssm", { parameterName: user_config['baseImage'] }).stringValue

    }
    else {
      base_arn = user_config['baseImage'];
    }

    const instance_profile_name = user_config['instanceProfileName'] ?? `golden-ami-instance-profile-${attr}`
    const instance_profile_role_name = user_config['instanceProfileRoleName'] ?? undefined


    this.instance_profile_role = this.CreateInstanceProfileRole(
      this.bucket.bucketName,
      instance_profile_role_name,
      instance_profile_name
    );

    let dist_arn = undefined

    if (user_config['amitag']) { this.amitag = user_config['amitag'] }
    if (user_config['tag']) { this.tag = user_config['tag'] }

    if (user_config["Distribution"]) {
      this.distribution = user_config["Distribution"];
      const distribution_name = user_config['distributionName'] ?? `golden-ami-distribution-${attr}`
      const distribution_desc = user_config['distributionDescription'] ?? `Destribution settings for ${attr}`
      this.dist = this.CreateDistribution(this.distribution, this.amitag, this.tag, distribution_name, distribution_desc);
      dist_arn = this.dist.attrArn
    }

    const key_alias = user_config['key_alias'] ?? undefined
    let keyid

    if (user_config['iamEncryption'] === undefined) {
      keyid = undefined
    }
    else{
      if (user_config.iamEncryption){
        this.cmk = this.CreateKMSKey(this.distribution, key_alias);
        keyid = this.cmk.keyId
      }
      else {
        keyid = undefined
      }
    }
    this.recipe = this.buildRecipe(
      base_arn,
      user_config,
      keyid,
      this.component_list,
      attr
    );

    this.infra = this.CreateInfra(
      this.instance_profile_role,
      user_config,
      attr
    )
    this.infra.addDependsOn(this.instance_profile_role);
    const imagepipelinename = user_config['imagePipelineName'] ?? `golden-ami-pipeline-${attr}`

    this.pipeline = this.CreateImagePipeline(
      this.recipe,
      dist_arn,
      this.infra.attrArn,
      imagepipelinename,
      user_config['schedule']
    );
    this.pipeline.addDependsOn(this.infra);
  }

  private CreateImagePipeline(
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
  private CreateInfra(
    instanceprofile: iam.CfnInstanceProfile,
    user_config: MainConfing,
    attr: string
  ): imagebuilder.CfnInfrastructureConfiguration {
    if (user_config["infrastructure"] === undefined ){
      user_config["infrastructure"] = {}
    }
    try {
      const infraconfig = new imagebuilder.CfnInfrastructureConfiguration(
        this,
        "Golden_AMI_Instance_Infra",
        {
          name: user_config["infrastructure"]["name"] ?? `golden-ami-infra-${attr}`,
          instanceTypes: user_config["infrastructure"]["instance_type"],
          instanceProfileName: instanceprofile.instanceProfileName!,
          subnetId: user_config["infrastructure"]["subnet_id"],
          securityGroupIds: user_config["infrastructure"]["security_groups"],
          snsTopicArn: user_config["sns_topic"]
        }
      );
      return infraconfig;
    } catch (error) {
      throw new Error("Error creating infra config");
    }
  }
  private CreateDistribution(
    distribution: distribution[],
    amitag: object | undefined,
    tag: object | undefined,
    name: string,
    description: string | undefined
  ): imagebuilder.CfnDistributionConfiguration {
    let distributions_list: imagebuilder.CfnDistributionConfiguration.DistributionProperty[] =
      [];
    distribution.forEach((value) => {
      const amiDistributionConfiguration: imagebuilder.CfnDistributionConfiguration.AmiDistributionConfigurationProperty =
      {
        amiTags: amitag as IResolvable,
        targetAccountIds: value.accounts,
      };
      const distributionProperty: imagebuilder.CfnDistributionConfiguration.DistributionProperty =
      {
        region: value.region,
        amiDistributionConfiguration: amiDistributionConfiguration,
      };
      distributions_list.push(distributionProperty);
    });
    try {
      const cfn_distribution_configuration =
        new imagebuilder.CfnDistributionConfiguration(
          this,
          "MyCfnDistributionConfiguration",
          {
            distributions: distributions_list,
            tags: tag as { [key: string]: string; },
            name: name,
            description: description,
          }
        );
      return cfn_distribution_configuration;
    } catch (error) {
      throw new Error("Error creating pipeline");
    }
  }
  private buildRecipe(
    base_arn: string,
    user_config: MainConfing,
    keyid: string | undefined,
    component_list: component_list[],
    attr: string
  ): imagebuilder.CfnImageRecipe {
    let encryption_needed: boolean
    if (keyid === undefined) {
      encryption_needed = false
    }
    else {
      encryption_needed = true
    }
    const encryption = keyid ?? false
    const recipe = new imagebuilder.CfnImageRecipe(this, "ImageRecipe", {
      name: user_config["image_recipe"]["image_recipe_name"] ?? `golden-ami-recipe-${attr}`,
      version: user_config["image_recipe"]["image_recipe_version"],
      components: component_list,
      parentImage: base_arn,
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            deleteOnTermination: user_config["image_recipe"]['deleteOnTermination'],
            encrypted: encryption_needed,
            kmsKeyId: keyid,
            volumeSize: user_config["image_recipe"]["volume_size"],
            volumeType: user_config["image_recipe"]["volume_type"]
          },
        },
      ],
    });
    if (user_config['resource_removal_policy'] === "destroy") {
      recipe.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
    else {
      recipe.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    }
    return recipe;
  }
  private CreateInstanceProfileRole(
    bucket_name: string,
    instance_profile_role_name: string | undefined,
    instance_profile_name: string

  ): iam.CfnInstanceProfile {
    const role = new iam.Role(this, "Golden_AMI_Instance_Profile_Role", {
      roleName: instance_profile_role_name,
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
          `arn:aws:s3:::${bucket_name}`,
          `arn:aws:s3:::${bucket_name}/*`,
        ],
      })
    );

    const instanceprofile = new iam.CfnInstanceProfile(
      this,
      "Golden_AMI_Instanc_Profile",
      {
        instanceProfileName: instance_profile_name,
        roles: [role.roleName],
      }
    );
    return instanceprofile;
  }

  private CreateKMSKey(dist: distribution[] | undefined, alias: string | undefined): kms.Key {
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
    };
    return cmk;
  }
  private AddComponent(
    config: ComponentConfig,
    bucket_name: string,
    component_type: string,
    b_deploy: BucketDeployment

  ) {
    let build_type: any = "";

    if (component_type === "Build") build_type = "Build";
    else if (component_type === "Test") build_type = "Test";

    if (build_type in config) {
      let cfg = config[build_type as keyof typeof config];

      cfg!.forEach((value) => {
        let arn = value.arn;
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
          let uri = `s3://${bucket_name}/${value.file}`;
          let imageBuild = new imagebuilder.CfnComponent(
            this,
            `${value.name}-${build_type}`,
            {
              name: value.name as string,
              platform: "Linux",
              version: value.version!,
              uri,
            }
          );
          imageBuild.node.addDependency(b_deploy)
          this.component_build.push(imageBuild);

          if ("parameter" in value) {
            this.componentArn.push({
              arn: this.component_build.slice(-1)[0].attrArn,
              param: value.parameter!,
            });
          } else {
            this.componentArn.push({
              arn: this.component_build.slice(-1)[0].attrArn,
            });
          }
        }
      });
    }
  }
}