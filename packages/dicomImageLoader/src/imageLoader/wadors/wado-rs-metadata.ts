export interface WadoRsMetaDataElement {
  Value: string[] | number[];
}

export type WadoRsMetaData = Record<string, WadoRsMetaDataElement>;
