import { makeArrayLike } from '../metadataProvider/makeArrayLike';
import { mapTagInfo } from '../Tags';
import { BaseDicomListener } from './BaseDicomListener';
import { DicomStreamListener } from './DicomStreamListener';
import type { IListenerInfo } from './DicomStreamTypes';
import type { MetadataValueType } from './MetadataTagListener';

export class NaturalTagListener extends BaseDicomListener {
  public info: IListenerInfo;
  public tag: string;
  public dest: MetadataValueType | MetadataValueType[];
  public singleVm: boolean;
  public name: string;

  /**
   * Creates a stream listener which creates the normalized objects
   */
  public static newNaturalStreamListener(options?) {
    return new DicomStreamListener({
      ...options,
      createTagListener: function (tag, info) {
        return new NaturalTagListener(this.listener, tag, info, options);
      },
    });
  }

  constructor(parent, tag: string, info: IListenerInfo, options?) {
    super(parent);
    this.tag = tag;
    const tagData = mapTagInfo.get(tag);
    const nameKey = options?.nameKey || 'name';
    this.name = info?.name || tagData?.[nameKey] || tag;
    this.singleVm = tagData ? tagData.vm === 1 : null;
    this.info = info;
  }

  public value(value: MetadataValueType) {
    if (!this.dest) {
      if (this.singleVm) {
        this.dest = makeArrayLike(value);
        this.parent.dest[this.name] = this.dest;
        return;
      }
      this.dest = [];
      this.parent.dest[this.name] = this.dest;
    }
    if (this.singleVm) {
      console.error(
        'Storing multiple values into',
        this.name,
        this.dest,
        this.value
      );
      // Clear it so we store as array
      this.singleVm = null;
      this.dest = [this.dest as MetadataValueType];
      this.parent.dest[this.name] = this.dest;
    }
    (this.dest as MetadataValueType[]).push(value);
  }

  public pop() {
    if (
      (this.dest as MetadataValueType[])?.length === 1 &&
      this.singleVm === null &&
      typeof this.dest[0] === 'object'
    ) {
      this.dest = makeArrayLike(this.dest[0]);
      this.parent.dest[this.name] = this.dest;
    }
    return this.dest;
  }
}
