import { BaseDicomListener } from './BaseDicomListener';
import type { IListenerInfo } from './DicomStreamTypes';

export type MetadataValueType = string | number | MetadataType;

export interface MetadataType {
  Value?: MetadataValueType[];
  BulkDataURI?: string;
  BulkDataUUID?: string;
}

export class MetadataTagListener extends BaseDicomListener {
  public info: IListenerInfo;
  public tag: string;
  public dest: MetadataType;

  constructor(parent, tag: string, info: IListenerInfo) {
    super(parent);
    this.tag = tag;
    this.info = info;
  }

  public value(value: unknown) {
    if (!this.dest) {
      this.dest = {
        Value: new Array<MetadataValueType>(),
      };
      this.parent.dest[this.tag] = this.dest;
    }
    this.dest.Value.push(value);
  }
}
