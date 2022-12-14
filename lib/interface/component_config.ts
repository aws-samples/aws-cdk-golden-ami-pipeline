export interface ComponentConfig {
  Build?: {
    name?: string;
    file?: string;
    version?: string;
    arn?: string;
    parameter?: { name: string; value: string[] }[];
  }[];
  Test?: {
    name?: string;
    file?: string;
    version?: string;
    arn?: string;
    parameter?: { name: string; value: string[] }[];
  }[];
}
