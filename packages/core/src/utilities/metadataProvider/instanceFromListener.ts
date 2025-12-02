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

  data.syncIterator(listener, options);
  console.warn('Created listener instance:', listener.instance);
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

  addSection?(type: SectionTypes);
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
  }
}
export class NormalSection extends Section {}

export class TagSection extends Section {
  public destKey;
  public vr: string;
  public singleton: boolean;

  constructor(parent, destKey, vr, singleton) {
    super(parent, null);
    this.destKey = destKey;
    this.vr = vr;
    this.singleton = singleton;
  }

  public rawListener(blockdata: Uint8Array) {
    this.dest ||= [];
    this.dest.push(blockdata);
  }

  public addSection(type: SectionTypes) {
    throw new Error('TODO - implement addSection on tag');
  }

  public valueListener(value) {
    this.dest ||= [];
    this.dest.push(value);
  }
}

export class NormalListener {
  public fmi = null;
  public instance = {};

  public current: DicomListener = new NormalSection(null, this.instance);

  public addSection(type: SectionTypes) {
    if (type === SectionTypes.FMI) {
      return this.addSectionFMI();
    }
    throw new Error(`Unknown section type: ${type}`);
  }

  public endSection() {
    this.current.endSection?.();
    this.current = this.current.parent;
  }

  public addSectionFMI() {
    this.fmi ||= {};
    this.current = new NormalSection(this.current, this.fmi);
  }

  public addTag(tag: string, vr: string, _length: number) {
    const tagInfo = mapTagInfo.get(tag);
    if (!tagInfo) {
      console.warn('Skipping tag', tag);
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
