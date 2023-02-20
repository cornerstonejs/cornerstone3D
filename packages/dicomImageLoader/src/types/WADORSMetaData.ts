export interface WADORSMetaDataElement {
  Value: string[] | number[];
}

export type WADORSMetaData = Record<string, WADORSMetaDataElement>;
