export interface IDicomListener {
  parent: IDicomListener;
  dest?;

  addTag?: (tag: string, info?: IListenerInfo) => void | IDicomListener;
  values?: (array: unknown[]) => void;
  value?: (value: unknown) => void;

  pop?: () => unknown;
}

export interface IListenerInfo {
  vr?: string;
  vm?: number | string;
  length?: number;
  name?: string;
}

export type MetadataValueType =
  | ArrayBuffer[]
  | ArrayBuffer
  | string
  | number
  | MetadataType;

export interface MetadataType {
  Value?: MetadataValueType[];
  BulkDataURI?: string;
  BulkDataUUID?: string;
  vr: string;
}
