/**
 * Delivers metadata from a standard DICOMweb Metadata instance to a listener
 */

import { dictionaryLookup, mapTagInfo } from '../Tags';

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
      const vr = value.vr;
      const tagData = mapTagInfo.get(key);
      const dictEntry = !tagData ? dictionaryLookup(key) : undefined;
      const hasBulk =
        !value.Value &&
        ((value as MetadataValue).BulkDataURI ??
          (value as MetadataValue).InlineBinary);
      if (!value.Value && !hasBulk) {
        continue;
      }
      listener.addTag(key, {
        vr,
        name: tagData?.name || dictEntry?.name,
        vm: tagData?.vm ?? dictEntry?.vm,
      });
      if (vr === 'SQ') {
        for (const v of value.Value) {
          listener.startObject();
          this.syncIterator(listener, v);
          listener.pop();
        }
        listener.pop();
        continue;
      }
      if (hasBulk) {
        listener.values([
          {
            BulkDataURI: (value as MetadataValue).BulkDataURI,
            InlineBinary: (value as MetadataValue).InlineBinary,
          },
        ]);
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
  BulkDataURI?: string;
  InlineBinary?: string;
};
