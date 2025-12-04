import { MetadataModules } from '../../enums';
import { addTypedProvider, getMetaData } from '../../metaData';
import { mapTagInfo } from '../Tags';

export function instanceFromListener(next, query, data, options) {
  data = getMetaData(
    MetadataModules.DICOM_SOURCE,
    query,
    options?.[MetadataModules.DICOM_SOURCE]
  );
  if (!data) {
    console.warn("Couldn't find instance data for", query);
    return next(query, data, options);
  }
  const listener = new NormalListener();

  data.syncIterator(listener);
  console.warn('New instance:', JSON.stringify(listener.instance, null, 2));
  return listener.instance;
}

addTypedProvider(MetadataModules.INSTANCE, instanceFromListener);

export enum SectionTypes {
  FMI = 'FMI',
  SQ = 'SQ',
  BULKDATA = 'BULKDATA',
  ITEM = 'ITEM',
}

export type ValueHandler = {
  rawListener?: (value) => void;
  skipData?: boolean;
  valueListener?: (value) => void;
};

export enum DeliverType {
  /**
   *  Handle as a raw stream - this will only be done if possible, otherwise
   * a value stream may be called.
   */
  RawStream = 'RawStream',

  /**
   * Handle as a value stream of already parsed data
   */
  Value = 'Value',

  /**
   * Just skip the data
   */
  Skip = 'Skip',

  /**
   * Parse the data/sub-section data
   */
  Parse = 'Parse',
}

/**
 * The general contract for a DICOM listener.
 *
 * TODO - move to dcmjs
 */
export interface DicomListener {
  addTag?(tag: string, vr: string, length: number | boolean): DeliverType;

  startSection?(type: SectionTypes);
  endSection?();

  rawListener?: (blockdata) => void;
  valueListener?: (value) => void;

  parent?: DicomListener;
}

export class Section implements DicomListener {
  public parent;

  public dest;

  constructor(parent, dest) {
    this.parent = parent;
    this.dest = dest;
  }
}
export class NormalSection extends Section {
  constructor(parent, dest = {}) {
    super(parent, dest);
  }

  public endSection() {
    this.parent.valueListener(this.dest);
  }
}

export class TagSection extends Section {
  public destKey;
  public vr: string;
  public singleton: boolean;

  constructor(parent, destKey, vr, singleton = false) {
    super(parent, null);
    this.destKey = destKey;
    this.vr = vr;
    this.singleton = singleton;
  }

  public rawListener(blockdata: Uint8Array) {
    this.dest ||= [];
    this.dest.push(blockdata);
  }

  public startSection(type: SectionTypes) {
    throw new Error('TODO - implement addSection on tag');
  }

  public endSection() {
    this.parent.dest[this.destKey] = this.dest;
  }

  public valueListener(value) {
    if (this.singleton) {
      this.dest = value;
    } else {
      this.dest ||= [];
      this.dest.push(value);
    }
  }
}

export class NormalListener {
  public fmi = null;
  public instance = {};

  public current: DicomListener = new NormalSection(null, this.instance);

  public startSection(type: SectionTypes) {
    if (type === SectionTypes.FMI) {
      return this.startSectionFMI();
    }
    this.current = new NormalSection(this.current);
  }

  public endSection() {
    this.current.endSection?.();
    this.current = this.current.parent;
  }

  public startSectionFMI() {
    this.fmi ||= {};
    this.current = new NormalSection(this.current, this.fmi);
  }

  public valueListener(value) {
    if (!this.current.valueListener) {
      console.warn('Value listener is not a listener');
      return;
    }
    this.current.valueListener(value);
  }

  public addTag(tag: string, vr: string, _length: number) {
    const tagInfo = mapTagInfo.get(tag);
    if (!tagInfo) {
      console.warn('No tag info:', tag, vr);
      return DeliverType.Skip;
    }
    vr = tagInfo.vr;
    if (vr === 'SQ') {
      this.current = new TagSection(
        this.current,
        tagInfo.name,
        vr,
        tagInfo.vm === 1
      );
      return DeliverType.Parse;
    }
    this.current = new TagSection(
      this.current,
      tagInfo.name,
      vr,
      tagInfo.vm === 1
    );
    return DeliverType.Value;
  }
}

addTypedProvider(MetadataModules.INSTANCE, instanceFromListener);
