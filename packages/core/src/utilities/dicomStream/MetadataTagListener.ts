import { mapTagInfo } from '../Tags';
import { BaseDicomListener } from './BaseDicomListener';
import type { IListenerInfo } from './DicomStreamTypes';

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

export class MetadataTagListener extends BaseDicomListener {
  public info: IListenerInfo;
  public tag: string;
  public dest: MetadataType;
  public vr: string;

  constructor(parent, tag: string, info: IListenerInfo) {
    super(parent);
    this.tag = tag;
    this.info = info;
    const tagData = mapTagInfo.get(tag);
    this.vr = info?.vr || tagData?.vr;
  }

  public value(value: unknown) {
    if (!this.dest) {
      this.dest = {
        Value: new Array<MetadataValueType>(),
        vr: this.vr,
      };
      this.parent.dest[this.tag] = this.dest;
    }
    this.dest.Value.push(value as MetadataValueType);
  }
}
