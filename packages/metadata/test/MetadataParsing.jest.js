import { NaturalTagListener } from '../src/utilities/dicomStream/NaturalTagListener';
import { MetaDataIterator } from '../src/utilities/dicomStream/MetaDataIterator';
import { tags as ctBigEndianTags } from '../../dicomImageLoader/testImages/CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.wado-rs-tags';
import { tags as noPixelSpacingTags } from '../../dicomImageLoader/testImages/no-pixel-spacing.wado-rs-tags';
import { tags as usMultiframeTags } from '../../dicomImageLoader/testImages/us-multiframe-ybr-full-422.wado-rs-tags';

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import dcmjs from 'dcmjs';

const { AsyncDicomReader } = dcmjs.async;
const { DicomMetadataListener } = dcmjs.utilities;

const testImagesDir = path.resolve(
  __dirname,
  '../../dicomImageLoader/testImages'
);

/**
 * Parse DICOMweb JSON metadata (wadors) into a natural instance.
 */
function parseWadoRs(tags) {
  const data = new MetaDataIterator(tags);
  const listener = new DicomMetadataListener({}, new NaturalTagListener());
  listener.startObject();
  data.syncIterator(listener);
  return listener.pop();
}

/**
 * Parse a binary DICOM file using AsyncDicomReader + DicomMetadataListener and
 * NaturalTagListener filter so that pixel data (and other bulk data) is
 * naturalized correctly.
 */
async function parseBinaryDicom(filePath) {
  const buffer = fs.readFileSync(filePath);
  const reader = new AsyncDicomReader();
  const listener = new DicomMetadataListener({}, new NaturalTagListener());

  reader.stream.addBuffer(buffer);
  reader.stream.setComplete();

  await reader.readFile({ listener });
  return reader.dict;
}

// ---------------------------------------------------------------------------
// WADO-RS (DICOMweb JSON metadata) parsing via MetaDataIterator
// ---------------------------------------------------------------------------
describe('MetaDataIterator - WADO-RS parsing', () => {
  describe('CT BigEndian', () => {
    let instance;
    beforeAll(() => {
      instance = parseWadoRs(ctBigEndianTags);
    });

    it('produces a truthy instance', () => {
      expect(instance).toBeTruthy();
    });

    it('parses single-valued numeric tags', () => {
      expect(instance.Rows).toBe(512);
      expect(instance.Columns).toBe(512);
      expect(instance.BitsAllocated).toBe(16);
      expect(instance.BitsStored).toBe(16);
      expect(instance.HighBit).toBe(15);
      expect(instance.SamplesPerPixel).toBe(1);
    });

    it('parses single-valued string tags', () => {
      expect(instance.Modality).toBe('CT');
      expect(instance.StudyTime).toBe('083501');
      expect(instance.PhotometricInterpretation).toBe('MONOCHROME2');
    });

    it('parses multi-valued numeric tags as arrays', () => {
      expect(instance.PixelSpacing).toEqual([0.675781, 0.675781]);
      expect(instance.ImageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
      expect(instance.ImagePositionPatient).toEqual([
        -161.399994, -148.800003, 4.7,
      ]);
    });

    it('parses SliceThickness as a scalar', () => {
      expect(instance.SliceThickness).toBe(5);
    });

    it('parses UIDs', () => {
      expect(instance.SOPClassUID).toBe('1.2.840.10008.5.1.4.1.1.2');
      expect(instance.StudyInstanceUID).toBe(
        '1.2.840.113619.2.30.1.1762295590.1623.978668949.886'
      );
    });
  });

  describe('No Pixel Spacing (US)', () => {
    let instance;
    beforeAll(() => {
      instance = parseWadoRs(noPixelSpacingTags);
    });

    it('produces a truthy instance', () => {
      expect(instance).toBeTruthy();
    });

    it('parses basic dimensions', () => {
      expect(instance.Rows).toBe(600);
      expect(instance.Columns).toBe(800);
    });

    it('has no PixelSpacing', () => {
      expect(instance.PixelSpacing).toBeUndefined();
    });
  });

  describe('US Multiframe', () => {
    let instance;
    beforeAll(() => {
      instance = parseWadoRs(usMultiframeTags);
    });

    it('produces a truthy instance', () => {
      expect(instance).toBeTruthy();
    });

    it('parses NumberOfFrames', () => {
      expect(instance.NumberOfFrames).toBe(78);
    });

    it('parses basic dimensions', () => {
      expect(instance.Rows).toBe(600);
      expect(instance.Columns).toBe(800);
    });

    it('parses sequences', () => {
      expect(instance.SequenceOfUltrasoundRegions).toBeDefined();
      expect(instance.SequenceOfUltrasoundRegions.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Binary DICOM parsing via AsyncDicomReader + NaturalTagListener
// ---------------------------------------------------------------------------
describe('AsyncDicomReader - Binary DICOM parsing', () => {
  const ctBigEndianDcm = path.join(
    testImagesDir,
    'CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm'
  );

  describe('CT BigEndian', () => {
    let instance;
    beforeAll(async () => {
      instance = await parseBinaryDicom(ctBigEndianDcm);
    });

    it('produces a truthy instance', () => {
      expect(instance).toBeTruthy();
    });

    it('parses single-valued numeric tags', () => {
      expect(instance.Rows).toBe(512);
      expect(instance.Columns).toBe(512);
      expect(instance.BitsAllocated).toBe(16);
      expect(instance.BitsStored).toBe(16);
    });

    it('parses single-valued string tags', () => {
      expect(instance.Modality).toBe('CT');
      expect(instance.StudyTime).toBe('083501');
    });

    it('parses multi-valued numeric tags', () => {
      expect(instance.PixelSpacing).toEqual([0.675781, 0.675781]);
      expect(instance.ImageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
    });

    it('parses UIDs', () => {
      expect(instance.SOPClassUID).toBe('1.2.840.10008.5.1.4.1.1.2');
    });
  });

  describe('consistency with WADO-RS', () => {
    let wadorsInstance;
    let binaryInstance;

    beforeAll(async () => {
      wadorsInstance = parseWadoRs(ctBigEndianTags);
      binaryInstance = await parseBinaryDicom(ctBigEndianDcm);
    });

    it('produces matching Rows/Columns', () => {
      expect(binaryInstance.Rows).toBe(wadorsInstance.Rows);
      expect(binaryInstance.Columns).toBe(wadorsInstance.Columns);
    });

    it('produces matching Modality', () => {
      expect(binaryInstance.Modality).toBe(wadorsInstance.Modality);
    });

    it('produces matching BitsAllocated', () => {
      expect(binaryInstance.BitsAllocated).toBe(wadorsInstance.BitsAllocated);
    });

    it('produces matching SliceThickness', () => {
      expect(binaryInstance.SliceThickness).toBe(wadorsInstance.SliceThickness);
    });

    it('produces matching ImageOrientationPatient', () => {
      expect(binaryInstance.ImageOrientationPatient).toEqual(
        wadorsInstance.ImageOrientationPatient
      );
    });

    it('produces matching PixelSpacing', () => {
      expect(binaryInstance.PixelSpacing).toEqual(wadorsInstance.PixelSpacing);
    });

    it('produces matching StudyTime', () => {
      expect(binaryInstance.StudyTime).toBe(wadorsInstance.StudyTime);
    });

    it('produces matching SOPClassUID', () => {
      expect(binaryInstance.SOPClassUID).toBe(wadorsInstance.SOPClassUID);
    });
  });

  describe('Little Endian Explicit', () => {
    const leDcm = path.join(
      testImagesDir,
      'CTImage.dcm_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1.dcm'
    );

    it('parses basic metadata', async () => {
      const instance = await parseBinaryDicom(leDcm);
      expect(instance).toBeTruthy();
      expect(instance.Rows).toBe(512);
      expect(instance.Columns).toBe(512);
      expect(instance.Modality).toBe('CT');
    });
  });

  describe('Little Endian Implicit', () => {
    const leiDcm = path.join(
      testImagesDir,
      'CTImage.dcm_LittleEndianImplicitTransferSyntax_1.2.840.10008.1.2.dcm'
    );

    it('parses basic metadata', async () => {
      const instance = await parseBinaryDicom(leiDcm);
      expect(instance).toBeTruthy();
      expect(instance.Rows).toBe(512);
      expect(instance.Columns).toBe(512);
      expect(instance.Modality).toBe('CT');
    });
  });

  describe('US Multiframe', () => {
    const usDcm = path.join(testImagesDir, 'us-multiframe-ybr-full-422.dcm');

    it('parses multiframe metadata', async () => {
      const instance = await parseBinaryDicom(usDcm);
      expect(instance).toBeTruthy();
      expect(instance.NumberOfFrames).toBe(78);
      expect(instance.Rows).toBe(600);
      expect(instance.Columns).toBe(800);
    });
  });
});
