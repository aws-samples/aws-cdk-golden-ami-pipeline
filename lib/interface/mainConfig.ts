import { ComponentConfig } from "./Component_config";
import { distribution } from "./Distribution";
import { infrastructure } from "./Infrastructure";
import { Recipe } from "./Recipe"
export interface MainConfing {
  baseImage: string;
  baseImageType?: string;
  ami_component_bucket_name?: string;
  ami_component_bucket_create?: boolean;
  ami_component_bucket_version?: boolean;
  imagePipelineName?: string;
  instanceProfileName?: string;
  instanceProfileRoleName?: string;
  iamEncryption?: boolean;
  components_prefix: string;
  key_alias?: string;
  image_recipe: Recipe;
  sns_topic?: string;
  attr?: string
  amitag?: object;
  tag?: object;
  schedule?: object;
  infrastructure?: infrastructure;
  Component_Config: ComponentConfig;
  Distribution?: distribution[];
  distributionName?: string;
  distributionDescription?: string;
  resource_removal_policy?: string
}