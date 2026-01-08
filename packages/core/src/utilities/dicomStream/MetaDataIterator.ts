/**
 * Delivers metadata from a standard DICOMweb Metadata instance to a listener
 */

import { SkipListener } from './SkipListener';

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
        listener.addTag(key, { length: 0 });
        listener.pop();
        continue;
      }
      if (!value.Value) {
        // TODO - handle bulkdata and null data
        continue;
      }
      const vr = value.vr;
      const result = listener.addTag(key, { vr });
      if (result instanceof SkipListener) {
        listener.pop();
        continue;
      }
      if (vr === 'SQ') {
        for (const v of value.Value) {
          listener.startObject();
          this.syncIterator(listener, v);
          listener.pop();
        }
        listener.pop();
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
      listener.values(value.Value);
    }
  }
}

export type MetadataValue = {
  Value?: unknown[];
  vr: string;
};
