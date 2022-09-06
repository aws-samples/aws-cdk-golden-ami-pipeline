import { IResolvable, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MainConfing } from "./interface/mainConfig";
import { ComponentConfig } from "./interface/component_config";
import { distribution } from "./interface/distribution";
import path = require("path");
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import ssm from "aws-cdk-lib/aws-ssm";
import * as imagebuilder from "aws-cdk-lib/aws-imagebuilder";
import * as cdk from "@aws-cdk/core";

export interface ImageBuilderProps extends StackProps {
  bucket_name: string;
  components_prefix: string;
  base_ami_image: string;
  user_config: MainConfing;
  mandatory_config: ComponentConfig;
}

export interface component_list {
  componentArn: string;
  parameters?: {
    name: string;
    value: string[];
  }[];
}

export class ImagebuilderPipeline extends Stack {
  private amitag: object;
  private tag: object;

  private component_test: imagebuilder.CfnComponent[];
  private instance_profile_role: iam.CfnInstanceProfile;
  private cmk: kms.Key;
  private dist: imagebuilder.CfnDistributionConfiguration;
  private infra: imagebuilder.CfnInfrastructureConfiguration;
  private recipe: imagebuilder.CfnImageRecipe;
  private pipeline: imagebuilder.CfnImagePipeline;
  private componentArn: {
    arn: string;
    param?: { name: string; value: string[] }[] | undefined;
  }[] = [];
  private component_list: component_list[] = [];
  private component_build: imagebuilder.CfnComponent[] = [];
  private distribution: distribution[] = [];

  constructor(scope: Construct, id: string, props: ImageBuilderProps) {
    super(scope, id, props);
    const {
      bucket_name,
      components_prefix,
      base_ami_image,
      user_config,
      mandatory_config,
    } = props;
    let attr = user_config['attr'];

    // Build  Components.

    // Order of adding the components: Mandatory Build --> User Defined Buid --> Validate with Inspector if enabled --> User Defined Test --> Mandatory Test
    this.AddComponent(mandatory_config, bucket_name, "Build");
    this.AddComponent(user_config["Component_Config"], bucket_name, "Build");
    if (user_config.inspector_validation && user_config.Inspector_Config){
        this.AddComponent(user_config["Inspector_Config"], bucket_name, "Build");
    }
    this.AddComponent(user_config["Component_Config"], bucket_name, "Test");
    this.AddComponent(mandatory_config, bucket_name, "Test");

    // Apply Removal Policy, If we have to retain old version, make to RETAIN
    this.component_build.forEach((value) => {
      value.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    });

    let comp_list: component_list = { componentArn: "" };
    this.componentArn.forEach((value) => {
      comp_list.componentArn = value.arn;
      if (value.param) comp_list.parameters = value.param;
      this.component_list.push(comp_list);
      comp_list = { componentArn: "" };
    });

    let base_arn: string = "";
    if (user_config["baseImageType"] === "ssm")
      base_arn = ssm.StringParameter.valueForStringParameter(
        this,
        base_ami_image
      );
    else if (user_config["baseImageType"] === "id") base_arn = base_ami_image;

    this.instance_profile_role = this.CreateInstanceProfileRole(
      bucket_name,
      attr
    );
    let dist_arn = undefined
    if (user_config['amitag']) {
      this.amitag = user_config['amitag']
    }
    if (user_config['tag']) {
      this.tag = user_config['tag']
    }
    if (user_config["Distribution"]) {
      this.distribution = user_config["Distribution"];
      this.dist = this.CreateDistribution(this.distribution, this.amitag, this.tag, attr);
      dist_arn = this.dist.attrArn
    }

    this.cmk = this.CreateKMSKey(this.distribution, attr);
    this.recipe = this.buildRecipe(
      base_arn,
      user_config,
      this.cmk,
      this.component_list,
      attr
    );

    this.infra = this.CreateInfra(
      this.instance_profile_role,
      user_config,
      attr
    )
    this.infra.addDependsOn(this.instance_profile_role);
    let imagepipelinename: string = ""
    if (user_config['imagePipelineName']){
      imagepipelinename = user_config['imagePipelineName'] 
    }
    else {
      imagepipelinename = `Golden_Image_Pipeline-${attr}`
    }
      
    this.pipeline = this.CreateImagePipeline(
      this.recipe,
      dist_arn,
      this.infra.attrArn,
      attr,
      imagepipelinename
    );
    this.pipeline.addDependsOn(this.infra);
  }

  private CreateImagePipeline(
    imageRecipe: imagebuilder.CfnImageRecipe,
    dist: string|undefined,
    infra: string,
    attr: string,
    name: string
  ): imagebuilder.CfnImagePipeline {
    try {
      const pipeline = new imagebuilder.CfnImagePipeline(
        this,
        "Golden_AMI_Pipeline_TS",
        {
          name: name,
          imageRecipeArn: imageRecipe.attrArn,
          infrastructureConfigurationArn: infra,
          distributionConfigurationArn: dist
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
    try {
      let instanceTypes, subnetId, securityGroupIds,snsTopicArn
      if (user_config["infrastructure"]){
        instanceTypes = user_config["infrastructure"]["instance_type"]
        subnetId = user_config["infrastructure"]["subnet_id"]
        securityGroupIds = user_config["infrastructure"]["security_groups"]
      }
      if (user_config["sns_topic"]){
        snsTopicArn = user_config["sns_topic"]
      }
      const infraconfig = new imagebuilder.CfnInfrastructureConfiguration(
        this,
        "Golden_AMI_Instance_Infra_TS",
        {
          name: `Golden_AMI_Instance_Infra-${attr}`,
          instanceTypes: instanceTypes,
          instanceProfileName: instanceprofile.instanceProfileName!,
          subnetId: subnetId,
          securityGroupIds: securityGroupIds,
          snsTopicArn: snsTopicArn,
        }
      );
      return infraconfig;
    } catch (error) {
      throw new Error("Error creating infra config");
    }
  }
  private CreateDistribution(
    distribution: distribution[],
    amitag: object|undefined,
    tag: object|undefined,
    attr: string
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
          "MyCfnDistributionConfiguration_TS",
          {
            distributions: distributions_list,
            tags: tag as { [key: string]: string; },
            name: `Golden_AMI_Distribution-${attr}`,
            description: `Golden AMI Distribution Settings for ${attr}`,
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
    cmk: kms.Key,
    component_list: component_list[],
    attr: string
  ): imagebuilder.CfnImageRecipe {
    const recipe = new imagebuilder.CfnImageRecipe(this, "ImageRecipe", {
      name: `${user_config["image_receipe"]["image_receipe_name"]}-${attr}`,
      version: user_config["image_receipe"]["image_receipe_version"],
      components: component_list,
      parentImage: base_arn,
      blockDeviceMappings: [
        {
          deviceName: "/dev/xvda",
          ebs: {
            deleteOnTermination: true,
            encrypted: true,
            kmsKeyId: cmk.keyId,
            volumeSize: 4096,
            volumeType: "gp2",
          },
        },
      ],
    });
    return recipe;
  }
  private CreateInstanceProfileRole(
    bucket_name: string,
    attr: string
  ): iam.CfnInstanceProfile {
    const role = new iam.Role(this, "Golden_AMI_Instance_Profile_Role_TS", {
      roleName: `Golden_AMI_Instance_Profile_Role-${attr}`,
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
        actions: ["ssm:SendCommand", "ec2:CreateTags"],
        resources: ["*"],
      })
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:*"],
        resources: [
          `arn:aws:s3:::${bucket_name}`,
          `arn:aws:s3:::${bucket_name}/*`,
        ],
      })
    );

    const instanceprofile = new iam.CfnInstanceProfile(
      this,
      "Golden_AMI_Instanc_Profile_TS",
      {
        instanceProfileName: `Golden_AMI_Instanc_Profile-${attr}`,
        roles: [role.roleName],
      }
    );
    return instanceprofile;
  }

  private CreateKMSKey(dist: distribution[] | undefined, attr: string): kms.Key {
    const cmk = new kms.Key(this, "Golden_AMI_Encryption_Key", {
      alias: `Golden_AMI_Encryption_Key_${attr}`,
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
            "aws:PrincipalArn": `arn:aws:iam::${this.account}:role/aws-service-role/imagebuilder.amazonaws.com/AWSServiceRoleForImageBuilder`,
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
    component_type: string
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
              name: `${value.name}-${build_type}`,
              platform: "Linux",
              version: value.version!,
              uri,
            }
          );

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