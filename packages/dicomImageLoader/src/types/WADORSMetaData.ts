export interface WADORSMetaDataElement<
  ValueType = string[] | number[] | boolean
> {
  Value: ValueType;
}

export type WADORSMetaData = Record<string, WADORSMetaDataElement>;
