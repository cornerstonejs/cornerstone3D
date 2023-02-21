export interface WADORSMetaDataElement {
  Value: string[] | number[] | boolean;
}

export type WADORSMetaData = Record<string, WADORSMetaDataElement>;
