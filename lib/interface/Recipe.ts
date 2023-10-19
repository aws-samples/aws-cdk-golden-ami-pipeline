export interface Recipe {
    imageRecipeVersion: string; 
    imageRecipeName?: string ; 
    volumeSize?: number;
    volumeType?: string;
    deleteOnTermination?: boolean
}