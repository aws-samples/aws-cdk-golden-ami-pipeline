import { ComponentConfig } from "./component_config";
import { distribution } from "./distribution";
export interface MainConfing {
  region: string;
  baseImage: string;
  baseImageType: string;
  ami_component_bucket_name: string;
  imagePipelineName?: string;
  image_receipe: { image_receipe_version: string; image_receipe_name: string };
  golden_ami?: string;
  sns_topic?: string;
  attr: string
  amitag?:object;
  tag?: object;
  infrastructure?: {
    instance_type: string[];
    subnet_id: string;
    security_groups: string[];
  };
  inspector_validation?: boolean;
  Inspector_Config?: ComponentConfig;
  Component_Config: ComponentConfig;
  Distribution?: distribution[];
}