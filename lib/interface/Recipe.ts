export interface Recipe {
    image_recipe_version: string; 
    image_recipe_name?: string ; 
    volume_size?: number;
    volume_type?: string;
    deleteOnTermination?: boolean
}