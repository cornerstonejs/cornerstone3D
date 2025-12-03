/**
 * Delivers metadata from a standard DICOMweb Metadata instance to a listener
 */

export class MetaDataIterator {
  public metadata;

  constructor(metadata) {
    this.metadata = metadata;
  }

  public syncIterator(listener, object = this.metadata) {
    for (const [key, value] of Object.entries<MetadataValue>(object)) {
      if (key === '_vrMap' || value === undefined) {
        continue;
      }
      if (value === null) {
        listener.addTag(key, 'UN', 0);
        continue;
      }
      if (!value?.Value) {
        continue;
      }
      const result = listener.addTag(key, value?.vr, true);
      if (result === 'Skip') {
        continue;
      }
      if (result === 'Parse') {
        for (const v of value.Value) {
          listener.startSection('ITEM');
          this.syncIterator(listener, v);
          listener.endSection();
        }
        listener.endSection();
        continue;
      }
      for (const v of value.Value) {
        listener.valueListener(v);
      }
      listener.endSection();
    }
  }
}

export type MetadataValue = {
  Value?: unknown[];
  vr: string;
};
