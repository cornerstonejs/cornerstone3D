/* eslint-disable @typescript-eslint/no-explicit-any */
import * as dicomParser from 'dicom-parser';

import { metadataForDataset } from '../imageLoader/wadouri/metaData/metaDataProvider';
import {
  extractOrientationFromDataset,
  extractPositionFromDataset,
  extractSliceThicknessFromDataset,
  extractSpacingFromDataset,
} from '../imageLoader/wadouri/metaData/extractPositioningFromDataset';
import {
  combineFrameInstanceDataset,
  getDirectFrameInformation,
} from '../imageLoader/wadouri/combineFrameInstanceDataset';

/**
 * A present-but-empty sequence (SQ with zero items) gets `items: []` from
 * dicom-parser. (0054,0022) and (0054,0016) are Type 2 sequences, so an empty
 * one is valid there. (5200,9229) is Type 1 with exactly one item, so an empty
 * one is non-conformant, but it is guarded the same way so a malformed file
 * does not make the metadata lookups for its frames throw.
 *
 * These tests build real dicom-parser DataSets by parsing explicit VR little
 * endian bytes, so the empty sequences are exactly what dicom-parser produces
 * for a file.
 */

type SequenceLength = 'defined' | 'undefined';

function tagBytes(tag: string): number[] {
  const group = parseInt(tag.slice(1, 5), 16);
  const element = parseInt(tag.slice(5, 9), 16);

  return [group & 0xff, group >> 8, element & 0xff, element >> 8];
}

function uint32Bytes(value: number): number[] {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function stringElement(tag: string, vr: string, value: string): number[] {
  const padded = value.length % 2 ? `${value} ` : value;
  const valueBytes = Array.from(new TextEncoder().encode(padded));

  return [
    ...tagBytes(tag),
    vr.charCodeAt(0),
    vr.charCodeAt(1),
    valueBytes.length & 0xff,
    valueBytes.length >> 8,
    ...valueBytes,
  ];
}

function emptySequenceElement(
  tag: string,
  sequenceLength: SequenceLength
): number[] {
  const header = [...tagBytes(tag), 0x53, 0x51, 0, 0]; // 'SQ' + reserved

  if (sequenceLength === 'defined') {
    return [...header, ...uint32Bytes(0)];
  }

  // Undefined length, closed straight away by a Sequence Delimitation Item.
  return [
    ...header,
    ...uint32Bytes(0xffffffff),
    ...tagBytes('xfffee0dd'),
    ...uint32Bytes(0),
  ];
}

/** Elements must be passed in ascending tag order. */
function parseDataSet(elementBytes: number[][]): dicomParser.DataSet {
  const byteArray = new Uint8Array(elementBytes.flat());
  const parser = (dicomParser as any).littleEndianByteArrayParser;
  const dataSet = new (dicomParser as any).DataSet(parser, byteArray, {});
  const byteStream = new (dicomParser as any).ByteStream(parser, byteArray);

  (dicomParser as any).parseDicomDataSetExplicit(
    dataSet,
    byteStream,
    byteArray.length
  );

  return dataSet;
}

describe.each<SequenceLength>(['defined', 'undefined'])(
  'wadouri dataSet with an empty sequence (%s length)',
  (sequenceLength) => {
    describe('Detector Information Sequence (0054,0022) of an NM RECON TOMO image', () => {
      function nmDataSet(withEmptySequence: boolean) {
        return parseDataSet([
          stringElement('x00080008', 'CS', 'ORIGINAL\\PRIMARY\\RECON TOMO'),
          stringElement('x00080060', 'CS', 'NM'),
          ...(withEmptySequence
            ? [emptySequenceElement('x00540022', sequenceLength)]
            : []),
        ]);
      }

      it('is parsed by dicom-parser as a sequence with no items', () => {
        expect(nmDataSet(true).elements.x00540022.items).toEqual([]);
      });

      it('extractOrientationFromDataset returns undefined, as when the sequence is absent', () => {
        expect(extractOrientationFromDataset(nmDataSet(false))).toBeUndefined();
        expect(extractOrientationFromDataset(nmDataSet(true))).toBeUndefined();
      });

      it('extractPositionFromDataset returns undefined, as when the sequence is absent', () => {
        expect(extractPositionFromDataset(nmDataSet(false))).toBeUndefined();
        expect(extractPositionFromDataset(nmDataSet(true))).toBeUndefined();
      });

      it('imagePlaneModule does not throw and has no orientation or position', () => {
        const result = metadataForDataset(
          'imagePlaneModule',
          'wadouri:nm',
          nmDataSet(true)
        );

        expect(result.imageOrientationPatient).toBeUndefined();
        expect(result.imagePositionPatient).toBeUndefined();
      });
    });

    describe('Radiopharmaceutical Information Sequence (0054,0016)', () => {
      it('petIsotopeModule returns undefined, as when the sequence is absent', () => {
        const absent = parseDataSet([stringElement('x00080060', 'CS', 'PT')]);
        const empty = parseDataSet([
          stringElement('x00080060', 'CS', 'PT'),
          emptySequenceElement('x00540016', sequenceLength),
        ]);

        expect(
          metadataForDataset('petIsotopeModule', 'wadouri:pt', absent)
        ).toBeUndefined();
        expect(
          metadataForDataset('petIsotopeModule', 'wadouri:pt', empty)
        ).toBeUndefined();
      });
    });

    describe('Shared Functional Groups Sequence (5200,9229)', () => {
      function multiframeDataSet() {
        return parseDataSet([
          stringElement('x00080060', 'CS', 'MR'),
          stringElement('x00280008', 'IS', '2'),
          emptySequenceElement('x52009229', sequenceLength),
        ]);
      }

      it('combineFrameInstanceDataset returns the frame dataSet without shared elements', () => {
        const result = combineFrameInstanceDataset(1, multiframeDataSet());

        expect(result.string('x00080060')).toBe('MR');
        expect(result.elements.x52009229).toBeUndefined();
      });

      it('getDirectFrameInformation returns empty shared functional information', () => {
        expect(getDirectFrameInformation(multiframeDataSet(), 1)).toEqual({
          NumberOfFrames: 2,
          PerFrameFunctionalInformation: {},
          SharedFunctionalInformation: {},
        });
      });
    });

    describe('sequences that are already guarded', () => {
      it('empty Plane Orientation/Position and Pixel Measures sequences fall back to undefined', () => {
        const dataSet = parseDataSet([
          stringElement('x00080060', 'CS', 'MR'),
          emptySequenceElement('x00209113', sequenceLength),
          emptySequenceElement('x00209116', sequenceLength),
          emptySequenceElement('x00289110', sequenceLength),
        ]);

        expect(extractOrientationFromDataset(dataSet)).toBeUndefined();
        expect(extractPositionFromDataset(dataSet)).toBeUndefined();
        expect(extractSpacingFromDataset(dataSet)).toBeUndefined();
        expect(extractSliceThicknessFromDataset(dataSet)).toBeUndefined();
      });
    });
  }
);
