import { utilities } from '@cornerstonejs/core';

const {
  Tag: { mapTagInfo },
  toNumber,
} = utilities;

const vrParse = {
  UN: (xtag, location, dataset) => [],
  AE: string,
  AS: string,
  AT: int32,
  CS: strings,
  DA: string,
  DS: numberString,
  DT: string,
  FL: floatSingle,
  FD: floatDouble,
  IS: numberString,
  LO: strings,
  LT: string,
  PN: name,
  SH: strings,
  // SQ: sequence,
  SS: signedShort,
  ST: string,
  // SV: signedVeryLong,
  TM: strings,
  UC: strings,
  UI: strings,
  UL: unsignedLong,
  UR: string,
  US: unsignedShort,
  UT: string,
  // UV: unsignedVeryLong
};
/**
 * Delivers metadata from a standard DICOMweb Metadata instance to a listener
 */
export class DataSetIterator {
  public dataset;

  constructor(dataset) {
    this.dataset = dataset;
  }

  public syncIterator(listener, dataset = this.dataset) {
    const { elements } = dataset;
    for (const [key, value] of Object.entries(elements)) {
      const tagInfo = mapTagInfo.get(key);
      if (!tagInfo) {
        console.warn('Not registered:', key);
        continue;
      }

      const result = listener.addTag(tagInfo.tag, tagInfo.vr, value.length);
      if (result === 'Skip') {
        continue;
      }
      if (result === 'Parse') {
        const sequence = dataset.elements[key];
        if (sequence?.items) {
          for (const item of sequence.items) {
            listener.startSection('ITEM');
            this.syncIterator(listener, item.dataSet);
            listener.endSection();
          }
        }
        listener.endSection();
        continue;
      }
      const parser = vrParse[tagInfo.vr];
      if (!parser) {
        console.warn('No parser for', tagInfo.vr);
        listener.endSection();
        continue;
      }
      const parsed = parser(key, value, dataset);
      for (const v of parsed) {
        listener.valueListener(v);
      }
      listener.endSection();
    }
  }
}

function string(xtag, _location, dataset) {
  return [dataset.string(xtag)];
}

function strings(xtag, _location, dataset) {
  return dataset.string(xtag)?.split('\\') || [];
}

function numberString(xtag, _location, dataset) {
  return strings(xtag, _location, dataset).map(toNumber);
}

function int32(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 4;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.int32(xtag, i);
  }
  return result;
}

function floatSingle(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 2;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.float(xtag, i);
  }
  return result;
}

function floatDouble(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 8;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.double(xtag, i);
  }
  return result;
}

function name(xtag, location, dataset) {
  return strings(xtag, location, dataset).map((it) => ({
    Alphabetic: it,
  }));
}

function signedShort(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 2;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.int16(xtag, i);
  }
  return result;
}

function unsignedLong(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 4;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.uint32(xtag, i);
  }
  return result;
}

function unsignedShort(xtag, location, dataset) {
  const result = new Array<number>();
  const vm = location.length / 2;
  for (let i = 0; i < vm; i++) {
    result[i] = dataset.uint16(xtag, i);
  }
  return result;
}
