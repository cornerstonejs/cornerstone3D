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
      if (
        value.vr === 'CS' &&
        value.Value.length === 1 &&
        String(value.Value[0]).indexOf('\\') !== -1
      ) {
        // Fix static dicomweb CS values not split
        value.Value = String(value.Value[0]).split('\\');
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
