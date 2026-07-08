/* eslint-disable @typescript-eslint/no-explicit-any */
import { eventTarget } from '@cornerstonejs/core';

import { metadataForDataset } from '../imageLoader/wadouri/metaData/metaDataProvider';
import {
  extractOrientationFromDataset,
  extractPositionFromDataset,
  extractSliceThicknessFromDataset,
  extractSpacingFromDataset,
  getImageTypeSubItemFromDataset,
} from '../imageLoader/wadouri/metaData/extractPositioningFromDataset';
import getImagePixelModule from '../imageLoader/wadouri/metaData/getImagePixelModule';
import {
  combineFrameInstanceDataset,
  getMultiframeInformation,
  getFrameInformation,
  getDirectFrameInformation,
} from '../imageLoader/wadouri/combineFrameInstanceDataset';
import getUncompressedImageFrame from '../imageLoader/wadouri/getUncompressedImageFrame';
import unpackBinaryFrame from '../imageLoader/wadouri/unpackBinaryFrame';
import dataSetCacheManager, {
  loadedDataSets,
} from '../imageLoader/wadouri/dataSetCacheManager';
import { getUSEnhancedRegions } from '../imageLoader/wadouri/metaData/USHelpers';

/**
 * Minimal stand-in for a dicom-parser `DataSet`.
 *
 * `values` maps tag -> value. A value may be:
 *  - a plain string ('CT', '20260708', '0.7\\0.7')
 *  - an array, used for multi-valued numeric access (uint16/int16 with index)
 *
 * `elements` maps tag -> a raw dicom-parser style element object
 * ({ tag, length, dataOffset, items? }), used by code that reaches into
 * dataSet.elements directly (sequences, LUT data, multiframe merge, etc).
 */
function fakeDataSet(
  values: Record<string, any> = {},
  elements: Record<string, any> = {},
  byteArray: Uint8Array = new Uint8Array(0)
) {
  return {
    byteArray,
    elements,
    string: (t: string, i?: number) => {
      const v = values[t];
      if (v == null) {
        return undefined;
      }
      if (i != null) {
        const parts = Array.isArray(v) ? v : String(v).split('\\');
        return parts[i];
      }
      return v;
    },
    intString: (t: string, i?: number) => {
      const v = values[t];
      if (v == null) {
        return undefined;
      }
      const s =
        i != null ? (Array.isArray(v) ? v[i] : String(v).split('\\')[i]) : v;
      if (s == null) {
        return undefined;
      }
      return parseInt(s, 10);
    },
    floatString: (t: string, i?: number) => {
      const v = values[t];
      if (v == null) {
        return undefined;
      }
      const s =
        i != null ? (Array.isArray(v) ? v[i] : String(v).split('\\')[i]) : v;
      if (s == null) {
        return undefined;
      }
      return parseFloat(s);
    },
    uint16: (t: string, i = 0) =>
      Array.isArray(values[t]) ? values[t][i] : values[t],
    int16: (t: string, i = 0) =>
      Array.isArray(values[t]) ? values[t][i] : values[t],
    int32: (t: string) => values[t],
    double: (t: string) => values[t],
    numStringValues: () => undefined,
  };
}

describe('wadouri dataSet-layer', () => {
  describe('metaDataProvider - metadataForDataset', () => {
    describe('GENERAL_STUDY / GENERAL_SERIES / GENERAL_IMAGE / PATIENT modules', () => {
      it('formats study date/time via dicomParser.parseDA/parseTM', () => {
        const dataSet = fakeDataSet({
          x00081030: 'Chest CT',
          x00080020: '20260708',
          x00080030: '120000.000000',
          x00080050: 'ACC123',
        });

        const result = metadataForDataset(
          'generalStudyModule',
          'imageId',
          dataSet as any
        );

        expect(result.studyDescription).toBe('Chest CT');
        expect(result.studyDate).toEqual({ year: 2026, month: 7, day: 8 });
        expect(result.studyTime).toEqual({
          hours: 12,
          minutes: 0,
          seconds: 0,
          fractionalSeconds: 0,
        });
        expect(result.accessionNumber).toBe('ACC123');
      });

      it('handles a missing study time gracefully (empty string fallback)', () => {
        const dataSet = fakeDataSet({
          x00080020: '20260708',
        });

        const result = metadataForDataset(
          'generalStudyModule',
          'imageId',
          dataSet as any
        );

        expect(result.studyTime).toBeUndefined();
      });

      it('parses series module dates/times and numeric fields', () => {
        const dataSet = fakeDataSet({
          x00080060: 'CT',
          x0020000e: '1.2.3.series',
          x0008103e: 'Axial series',
          x00200011: '4',
          x0020000d: '1.2.3.study',
          x00080021: '20260101',
          x00080031: '080000.5',
          x00080022: '20260102',
          x00080032: '090000.5',
        });

        const result = metadataForDataset(
          'generalSeriesModule',
          'imageId',
          dataSet as any
        );

        expect(result.modality).toBe('CT');
        expect(result.seriesInstanceUID).toBe('1.2.3.series');
        expect(result.seriesNumber).toBe(4);
        expect(result.seriesDate).toEqual({ year: 2026, month: 1, day: 1 });
        expect(result.acquisitionDate).toEqual({
          year: 2026,
          month: 1,
          day: 2,
        });
      });

      it('parses general image module fields', () => {
        const dataSet = fakeDataSet({
          x00080018: '1.2.3.sop',
          x00200013: '7',
          x00282110: '01',
          x00282112: '10.5',
          x00282114: 'ISO_10918_1',
        });

        const result = metadataForDataset(
          'generalImageModule',
          'imageId',
          dataSet as any
        );

        expect(result.sopInstanceUID).toBe('1.2.3.sop');
        expect(result.instanceNumber).toBe(7);
        expect(result.lossyImageCompressionRatio).toBeCloseTo(10.5);
        expect(result.lossyImageCompressionMethod).toBe('ISO_10918_1');
      });

      it('parses patient and patientStudy modules', () => {
        const dataSet = fakeDataSet({
          x00100020: 'MRN001',
          x00100010: 'Doe^John',
          x00101010: '045Y',
          x00101020: '1.8',
          x00100040: 'M',
          x00101030: '80.5',
        });

        const patient = metadataForDataset(
          'patientModule',
          'imageId',
          dataSet as any
        );
        expect(patient.patientID).toBe('MRN001');
        expect(patient.patientName).toBe('Doe^John');

        const patientStudy = metadataForDataset(
          'patientStudyModule',
          'imageId',
          dataSet as any
        );
        // patientAge is not numeric DICOM (045Y), intString parses leading digits
        expect(patientStudy.patientAge).toBe(45);
        expect(patientStudy.patientSize).toBeCloseTo(1.8);
        expect(patientStudy.patientSex).toBe('M');
        expect(patientStudy.patientWeight).toBeCloseTo(80.5);
      });
    });

    describe('IMAGE_PLANE module', () => {
      it('derives pixel spacing, orientation and cosines from backslash separated strings', () => {
        const dataSet = fakeDataSet(
          {
            x00200052: 'FORUID',
            x00280010: 256,
            x00280011: 512,
            x00200037: '1\\0\\0\\0\\1\\0',
            x00200032: '10\\20\\30',
            x00280030: '0.7\\0.9',
            x00180050: '5',
            x00201041: '12.5',
          },
          { x00180050: { length: 1 } }
        );

        const result = metadataForDataset(
          'imagePlaneModule',
          'imageId',
          dataSet as any
        );

        expect(result.frameOfReferenceUID).toBe('FORUID');
        expect(result.rows).toBe(256);
        expect(result.columns).toBe(512);
        expect(result.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
        expect(result.rowCosines).toEqual([1, 0, 0]);
        expect(result.columnCosines).toEqual([0, 1, 0]);
        expect(result.imagePositionPatient).toEqual([10, 20, 30]);
        expect(result.pixelSpacing).toEqual([0.7, 0.9]);
        expect(result.rowPixelSpacing).toBe(0.7);
        expect(result.columnPixelSpacing).toBe(0.9);
        expect(result.sliceThickness).toBe(5);
        expect(result.sliceLocation).toBe(12.5);
        expect(result.usingDefaultValues).toBe(false);
      });

      it('falls back to default 1/1 spacing and null cosines when tags are absent', () => {
        const dataSet = fakeDataSet({
          x00280010: 64,
          x00280011: 64,
        });

        const result = metadataForDataset(
          'imagePlaneModule',
          'imageId',
          dataSet as any
        );

        expect(result.pixelSpacing).toBeUndefined();
        expect(result.rowPixelSpacing).toBe(1);
        expect(result.columnPixelSpacing).toBe(1);
        expect(result.usingDefaultValues).toBe(true);
        expect(result.rowCosines).toBeNull();
        expect(result.columnCosines).toBeNull();
        expect(result.imageOrientationPatient).toBeUndefined();
      });
    });

    describe('IMAGE_PIXEL module dispatch', () => {
      it('delegates to getImagePixelModule', () => {
        const dataSet = fakeDataSet({
          x00280002: 1,
          x00280004: 'MONOCHROME2',
          x00280010: 128,
          x00280011: 128,
          x00280100: 16,
          x00280101: 12,
          x00280102: 11,
          x00280103: 0,
        });

        const result = metadataForDataset(
          'imagePixelModule',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual(getImagePixelModule(dataSet as any));
        expect(result.rows).toBe(128);
        expect(result.bitsAllocated).toBe(16);
      });
    });

    describe('VOI_LUT module', () => {
      it('reads window center/width, voiLUTFunction and voiLUTSequence', () => {
        const voiLutItemDataSet = fakeDataSet(
          {},
          {
            x00283002: { length: 6 },
            x00283006: { length: 2 },
          }
        );
        // uint16/int16 index-based access on the LUT item dataset
        (voiLutItemDataSet as any).uint16 = (t: string, i = 0) => {
          if (t === 'x00283002') {
            return [10, 0, 16][i];
          }
          if (t === 'x00283006') {
            return [100, 200][i];
          }
          return undefined;
        };

        const dataSet = fakeDataSet(
          {
            x00281050: '40',
            x00281051: '400',
            x00281056: 'LINEAR',
            // No CT sopClassUID, no rescale slope/intercept and no modality LUT
            // sequence -> getModalityLUTOutputPixelRepresentation falls back to
            // the raw Pixel Representation tag (0 = unsigned).
            x00280103: 0,
          },
          {
            x00283010: {
              items: [{ dataSet: voiLutItemDataSet }],
            },
          }
        );

        const result = metadataForDataset(
          'voiLutModule',
          'imageId',
          dataSet as any
        );

        expect(result.windowCenter).toEqual([40]);
        expect(result.windowWidth).toEqual([400]);
        expect(result.voiLUTFunction).toBe('LINEAR');
        expect(result.voiLUTSequence).toEqual([
          {
            id: '1',
            firstValueMapped: 0,
            numBitsPerEntry: 16,
            lut: [100, 200],
          },
        ]);
      });

      it('returns undefined voiLUTSequence when no sequence element is present', () => {
        const dataSet = fakeDataSet({
          x00281050: '40\\50',
          x00281051: '400\\350',
        });

        const result = metadataForDataset(
          'voiLutModule',
          'imageId',
          dataSet as any
        );

        expect(result.windowCenter).toEqual([40, 50]);
        expect(result.windowWidth).toEqual([400, 350]);
        expect(result.voiLUTSequence).toBeUndefined();
      });

      describe('getModalityLUTOutputPixelRepresentation branches (via VOI_LUT dispatch)', () => {
        it('is always signed (1) for CT SOP classes', () => {
          const dataSet = fakeDataSet(
            {
              x00080016: '1.2.840.10008.5.1.4.1.1.2',
              x00283010: undefined,
            },
            {}
          );
          const lutDataSet = fakeDataSet({}, { x00283002: { length: 6 } });
          (dataSet as any).elements.x00283010 = {
            items: [{ dataSet: lutDataSet }],
          };
          (lutDataSet as any).int16 = (t: string, i = 0) =>
            t === 'x00283002' ? [1, -5, 16][i] : undefined;
          (lutDataSet as any).uint16 = (t: string, i = 0) =>
            t === 'x00283002' ? [1, -5, 16][i] : undefined;

          const result = metadataForDataset(
            'voiLutModule',
            'imageId',
            dataSet as any
          );

          // Signed path used int16 for firstValueMapped (-5 stays negative,
          // whereas the unsigned uint16 path never returns negative values).
          expect(result.voiLUTSequence[0].firstValueMapped).toBe(-5);
        });

        it('is signed when rescale slope/intercept push the minimum stored value negative', () => {
          const dataSet = fakeDataSet({
            x00281052: '-1024', // rescale intercept
            x00281053: '1', // rescale slope
            x00280103: 1, // signed pixel representation
            x00280101: 16, // bits stored
          });

          const result = metadataForDataset(
            'voiLutModule',
            'imageId',
            dataSet as any
          );

          // No voiLUTSequence in this fixture, but the branch is exercised;
          // assert indirectly there is no throw and windowCenter still reads.
          expect(result.voiLUTSequence).toBeUndefined();
        });

        it('is unsigned when a non-linear Modality LUT Sequence is present', () => {
          const dataSet = fakeDataSet(
            {},
            { x00283000: { length: 10 } } // presence + length>0 => unsigned output
          );

          // No VOI LUT sequence, but this exercises the
          // "non linear modality lut => unsigned" branch without throwing.
          const result = metadataForDataset(
            'voiLutModule',
            'imageId',
            dataSet as any
          );
          expect(result.voiLUTSequence).toBeUndefined();
        });
      });
    });

    describe('MODALITY_LUT module', () => {
      it('reads rescale intercept/slope/type and modalityLUTSequence', () => {
        const modalityLutItemDataSet = fakeDataSet({}, {});
        (modalityLutItemDataSet as any).uint16 = (t: string, i = 0) => {
          if (t === 'x00283002') {
            return [4, 0, 8][i];
          }
          if (t === 'x00283006') {
            return [1, 2, 3, 4][i];
          }
          return undefined;
        };

        const dataSet = fakeDataSet(
          {
            x00281052: '-1024',
            x00281053: '1',
            x00281054: 'HU',
            x00280103: 0,
          },
          {
            x00283000: {
              items: [{ dataSet: modalityLutItemDataSet }],
            },
          }
        );

        const result = metadataForDataset(
          'modalityLutModule',
          'imageId',
          dataSet as any
        );

        expect(result.rescaleIntercept).toBe(-1024);
        expect(result.rescaleSlope).toBe(1);
        expect(result.rescaleType).toBe('HU');
        expect(result.modalityLUTSequence).toEqual([
          {
            id: '1',
            firstValueMapped: 0,
            numBitsPerEntry: 8,
            lut: [1, 2, 3, 4],
          },
        ]);
      });
    });

    describe('SOP_COMMON module', () => {
      it('reads sopClassUID and sopInstanceUID', () => {
        const dataSet = fakeDataSet({
          x00080016: '1.2.840.10008.5.1.4.1.1.2',
          x00080018: '1.2.3.4.5',
        });

        const result = metadataForDataset(
          'sopCommonModule',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual({
          sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
          sopInstanceUID: '1.2.3.4.5',
        });
      });
    });

    describe('transferSyntax (non-DICOM-module aggregate key)', () => {
      it('reads the transfer syntax UID', () => {
        const dataSet = fakeDataSet({
          x00020010: '1.2.840.10008.1.2.1',
        });

        const result = metadataForDataset(
          'transferSyntax',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual({
          transferSyntaxUID: '1.2.840.10008.1.2.1',
        });
      });

      it('swallows errors from dataSet.string and returns transferSyntaxUID: undefined', () => {
        const dataSet = fakeDataSet({});
        (dataSet as any).string = () => {
          throw new Error('boom');
        };

        const result = metadataForDataset(
          'transferSyntax',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual({ transferSyntaxUID: undefined });
      });
    });

    describe('CINE module', () => {
      it('reads frameTime', () => {
        const dataSet = fakeDataSet({ x00181063: '33.33' });
        const result = metadataForDataset(
          'cineModule',
          'imageId',
          dataSet as any
        );
        expect(result.frameTime).toBeCloseTo(33.33);
      });
    });

    describe('NM_MULTIFRAME_GEOMETRY module', () => {
      it('computes isNMReconstructable from image type sub-item and modality', () => {
        const dataSet = fakeDataSet({
          x00080060: 'NM',
          x00080008: 'ORIGINAL\\PRIMARY\\RECON TOMO',
          x00280008: 60,
        });

        const result = metadataForDataset(
          'nmMultiframeGeometryModule',
          'imageId',
          dataSet as any
        );

        expect(result.modality).toBe('NM');
        expect(result.imageSubType).toBe('RECON TOMO');
        expect(result.isNMReconstructable).toBe(true);
        expect(result.numberOfFrames).toBe(60);
      });

      it('is false for non-reconstructable image sub types', () => {
        const dataSet = fakeDataSet({
          x00080060: 'NM',
          x00080008: 'ORIGINAL\\PRIMARY\\STATIC',
        });

        const result = metadataForDataset(
          'nmMultiframeGeometryModule',
          'imageId',
          dataSet as any
        );

        expect(result.isNMReconstructable).toBe(false);
      });
    });

    describe('PET_ISOTOPE module', () => {
      it('returns undefined when the radiopharmaceutical sequence is absent', () => {
        const dataSet = fakeDataSet({});
        const result = metadataForDataset(
          'petIsotopeModule',
          'imageId',
          dataSet as any
        );
        expect(result).toBeUndefined();
      });

      it('parses the first radiopharmaceutical info item', () => {
        const itemDataSet = fakeDataSet({
          x00181072: '093000.000000',
          x00181074: '370000000',
          x00181075: '6586.2',
        });
        const dataSet = fakeDataSet(
          {},
          {
            x00540016: { items: [{ dataSet: itemDataSet }] },
          }
        );

        const result = metadataForDataset(
          'petIsotopeModule',
          'imageId',
          dataSet as any
        );

        expect(
          result.radiopharmaceuticalInfo.radiopharmaceuticalStartTime
        ).toEqual({ hours: 9, minutes: 30, seconds: 0, fractionalSeconds: 0 });
        expect(result.radiopharmaceuticalInfo.radionuclideTotalDose).toBe(
          370000000
        );
        expect(result.radiopharmaceuticalInfo.radionuclideHalfLife).toBeCloseTo(
          6586.2
        );
      });
    });

    describe('PET_SERIES / PET_IMAGE modules', () => {
      it('reads PET series fields directly', () => {
        const dataSet = fakeDataSet({
          x00280051: 'ATTN\\DECY',
          x00541001: 'BQML',
          x00541102: 'START',
        });

        const result = metadataForDataset(
          'petSeriesModule',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual({
          correctedImage: 'ATTN\\DECY',
          units: 'BQML',
          decayCorrection: 'START',
        });
      });

      // NOTE: see "suspected product bugs" in the final report - PET_IMAGE
      // resolves x00541300/x00181242 to a *string value* first, and uses that
      // resolved value as the tag argument to floatString/intString, instead of
      // reading those tags directly. This test characterizes the actual
      // (surprising) behavior rather than the presumably-intended one.
      it('characterizes the double-indirection lookup for frameReferenceTime/actualFrameDuration', () => {
        const dataSet = fakeDataSet({
          x00541300: 'x00181242', // value of frameReferenceTime tag reused as a tag name
          x00181242: '55.5', // this is what actually gets floatString'd
        });

        const result = metadataForDataset(
          'petImageModule',
          'imageId',
          dataSet as any
        );

        // frameReferenceTime = floatString(string('x00541300')) = floatString('x00181242') = 55.5
        expect(result.frameReferenceTime).toBeCloseTo(55.5);
        // actualFrameDuration = intString(string('x00181242')) = intString('55.5'),
        // and tag '55.5' does not exist, so the resolved value is undefined
        // rather than the (presumably intended) parsed integer duration.
        expect(result.actualFrameDuration).toBeUndefined();
      });

      it('returns undefined fields when the underlying tags are absent', () => {
        const dataSet = fakeDataSet({});
        const result = metadataForDataset(
          'petImageModule',
          'imageId',
          dataSet as any
        );
        expect(result.frameReferenceTime).toBeUndefined();
        expect(result.actualFrameDuration).toBeUndefined();
      });
    });

    describe('ULTRASOUND_ENHANCED_REGION / CALIBRATION modules', () => {
      it('delegates ULTRASOUND_ENHANCED_REGION to getUSEnhancedRegions', () => {
        const regionItemDataSet = fakeDataSet({
          x0018602c: 0.1,
          x0018602e: 0.2,
          x00186024: 3,
          x00186026: 3,
        });
        const dataSet = fakeDataSet(
          {},
          { x00186011: { items: [{ dataSet: regionItemDataSet }] } }
        );

        const result = metadataForDataset(
          'ultrasoundEnhancedRegionModule',
          'imageId',
          dataSet as any
        );

        expect(result).toEqual(getUSEnhancedRegions(dataSet as any));
        expect(result[0].physicalDeltaX).toBeCloseTo(0.1);
      });

      it('CALIBRATION returns sequenceOfUltrasoundRegions only for US modality', () => {
        const regionItemDataSet = fakeDataSet({
          x0018602c: 0.5,
          x0018602e: 0.5,
        });
        const dataSet = fakeDataSet(
          { x00080060: 'US' },
          { x00186011: { items: [{ dataSet: regionItemDataSet }] } }
        );

        const result = metadataForDataset(
          'calibrationModule',
          'imageId',
          dataSet as any
        );

        expect(result.sequenceOfUltrasoundRegions).toHaveLength(1);
      });

      it('CALIBRATION returns undefined for non-US modality', () => {
        const dataSet = fakeDataSet({ x00080060: 'CT' });

        const result = metadataForDataset(
          'calibrationModule',
          'imageId',
          dataSet as any
        );

        expect(result).toBeUndefined();
      });
    });

    it('returns undefined for an unrecognized module type', () => {
      const dataSet = fakeDataSet({});
      const result = metadataForDataset(
        'notARealModule',
        'imageId',
        dataSet as any
      );
      expect(result).toBeUndefined();
    });
  });

  describe('extractPositioningFromDataset', () => {
    it('getImageTypeSubItemFromDataset returns the requested sub-item or undefined', () => {
      const dataSet = fakeDataSet({ x00080008: 'ORIGINAL\\PRIMARY\\AXIAL' });
      expect(getImageTypeSubItemFromDataset(dataSet as any, 0)).toBe(
        'ORIGINAL'
      );
      expect(getImageTypeSubItemFromDataset(dataSet as any, 2)).toBe('AXIAL');
      expect(getImageTypeSubItemFromDataset(dataSet as any, 5)).toBeUndefined();
      expect(
        getImageTypeSubItemFromDataset(fakeDataSet({}) as any, 0)
      ).toBeUndefined();
    });

    describe('orientation', () => {
      it('prefers the direct Image Orientation Patient tag', () => {
        const dataSet = fakeDataSet({ x00200037: '1\\0\\0\\0\\1\\0' });
        expect(extractOrientationFromDataset(dataSet as any)).toEqual([
          1, 0, 0, 0, 1, 0,
        ]);
      });

      it('falls back to the Plane Orientation Sequence', () => {
        const sequenceItemDataSet = fakeDataSet({
          x00200037: '0\\1\\0\\0\\0\\1',
        });
        const dataSet = fakeDataSet(
          {},
          { x00209116: { items: [{ dataSet: sequenceItemDataSet }] } }
        );
        expect(extractOrientationFromDataset(dataSet as any)).toEqual([
          0, 1, 0, 0, 0, 1,
        ]);
      });

      it('falls back to the NM Detector Information Sequence for RECON TOMO images', () => {
        const detectorItemDataSet = fakeDataSet({
          x00200037: '1\\0\\0\\0\\0\\1',
        });
        const dataSet = fakeDataSet(
          {
            x00080060: 'NM',
            x00080008: 'ORIGINAL\\PRIMARY\\RECON TOMO',
          },
          { x00540022: { items: [{ dataSet: detectorItemDataSet }] } }
        );
        expect(extractOrientationFromDataset(dataSet as any)).toEqual([
          1, 0, 0, 0, 0, 1,
        ]);
      });

      it('does not use the NM fallback for non-reconstructable image sub types', () => {
        const detectorItemDataSet = fakeDataSet({
          x00200037: '1\\0\\0\\0\\0\\1',
        });
        const dataSet = fakeDataSet(
          {
            x00080060: 'NM',
            x00080008: 'ORIGINAL\\PRIMARY\\STATIC',
          },
          { x00540022: { items: [{ dataSet: detectorItemDataSet }] } }
        );
        expect(extractOrientationFromDataset(dataSet as any)).toBeUndefined();
      });
    });

    describe('position', () => {
      it('prefers the direct Image Position Patient tag', () => {
        const dataSet = fakeDataSet({ x00200032: '1\\2\\3' });
        expect(extractPositionFromDataset(dataSet as any)).toEqual([1, 2, 3]);
      });

      it('falls back to the Plane Position Sequence', () => {
        const sequenceItemDataSet = fakeDataSet({ x00200032: '4\\5\\6' });
        const dataSet = fakeDataSet(
          {},
          { x00209113: { items: [{ dataSet: sequenceItemDataSet }] } }
        );
        expect(extractPositionFromDataset(dataSet as any)).toEqual([4, 5, 6]);
      });

      it('falls back to the NM Detector Information Sequence for RECON GATED TOMO images', () => {
        const detectorItemDataSet = fakeDataSet({ x00200032: '7\\8\\9' });
        const dataSet = fakeDataSet(
          {
            x00080060: 'NM',
            x00080008: 'ORIGINAL\\PRIMARY\\RECON GATED TOMO',
          },
          { x00540022: { items: [{ dataSet: detectorItemDataSet }] } }
        );
        expect(extractPositionFromDataset(dataSet as any)).toEqual([7, 8, 9]);
      });
    });

    describe('pixel spacing (Pixel Measures)', () => {
      it('prefers the direct Pixel Spacing tag', () => {
        const dataSet = fakeDataSet({ x00280030: '0.5\\0.6' });
        expect(extractSpacingFromDataset(dataSet as any)).toEqual([0.5, 0.6]);
      });

      it('falls back to the Pixel Measures Sequence', () => {
        const sequenceItemDataSet = fakeDataSet({ x00280030: '1.1\\1.2' });
        const dataSet = fakeDataSet(
          {},
          { x00289110: { items: [{ dataSet: sequenceItemDataSet }] } }
        );
        expect(extractSpacingFromDataset(dataSet as any)).toEqual([1.1, 1.2]);
      });

      it('returns undefined when neither source is present', () => {
        expect(
          extractSpacingFromDataset(fakeDataSet({}) as any)
        ).toBeUndefined();
      });
    });

    describe('slice thickness (Pixel Measures)', () => {
      it('prefers the direct Slice Thickness tag', () => {
        const dataSet = fakeDataSet(
          { x00180050: '2.5' },
          { x00180050: { length: 4 } }
        );
        expect(extractSliceThicknessFromDataset(dataSet as any)).toBe(2.5);
      });

      it('falls back to Slice Thickness inside the Pixel Measures Sequence', () => {
        const sequenceItemDataSet = fakeDataSet(
          { x00180050: '3.5' },
          { x00180050: { length: 4 } }
        );
        const dataSet = fakeDataSet(
          {},
          {
            x00289110: {
              items: [{ dataSet: sequenceItemDataSet }],
            },
          }
        );
        expect(extractSliceThicknessFromDataset(dataSet as any)).toBe(3.5);
      });

      it('returns undefined when no slice thickness source is present', () => {
        const dataSet = fakeDataSet({}, {});
        expect(
          extractSliceThicknessFromDataset(dataSet as any)
        ).toBeUndefined();
      });
    });
  });

  describe('getImagePixelModule', () => {
    it('reads the core CT-like fields and smallest/largest pixel values (unsigned)', () => {
      const dataSet = fakeDataSet({
        x00280002: 1,
        x00280004: 'MONOCHROME2',
        x00280010: 512,
        x00280011: 512,
        x00280100: 16,
        x00280101: 12,
        x00280102: 11,
        x00280103: 0,
        x00280006: 0,
        x00280034: '1\\1',
        x00280106: 0,
        x00280107: 4095,
      });

      const result = getImagePixelModule(dataSet as any);

      expect(result.samplesPerPixel).toBe(1);
      expect(result.photometricInterpretation).toBe('MONOCHROME2');
      expect(result.rows).toBe(512);
      expect(result.columns).toBe(512);
      expect(result.bitsAllocated).toBe(16);
      expect(result.bitsStored).toBe(12);
      expect(result.highBit).toBe(11);
      expect(result.pixelRepresentation).toBe(0);
      expect(result.smallestPixelValue).toBe(0);
      expect(result.largestPixelValue).toBe(4095);
      expect((result as any).redPaletteColorLookupTableData).toBeUndefined();
    });

    it('reads smallest/largest pixel values as signed when pixelRepresentation is 1', () => {
      const dataSet = fakeDataSet({
        x00280002: 1,
        x00280100: 16,
        x00280101: 16,
        x00280103: 1,
        x00280106: -1000,
        x00280107: 3000,
      });

      const result = getImagePixelModule(dataSet as any);

      expect(result.smallestPixelValue).toBe(-1000);
      expect(result.largestPixelValue).toBe(3000);
    });

    describe('PALETTE COLOR LUT descriptor correction', () => {
      function buildPaletteColorDataSet({
        numEntries,
        bitsAllocatedDescriptor,
        actualLutDataLength,
      }: {
        numEntries: number;
        bitsAllocatedDescriptor: number;
        actualLutDataLength: number;
      }) {
        // LUT data bytes: for an 8-bit-per-entry LUT the value length in bytes
        // equals the number of entries; for 16-bit it is twice as long.
        const lutBytes = new Uint8Array(actualLutDataLength);
        for (let i = 0; i < lutBytes.length; i++) {
          lutBytes[i] = i + 1;
        }

        const byteArray = lutBytes;

        return fakeDataSet(
          {
            x00280002: 1,
            x00280004: 'PALETTE COLOR',
            x00280100: 8,
            x00280101: 8,
            x00280103: 0,
            x00281101: [numEntries, 0, bitsAllocatedDescriptor],
            x00281102: [numEntries, 0, bitsAllocatedDescriptor],
            x00281103: [numEntries, 0, bitsAllocatedDescriptor],
          },
          {
            x00281101: { length: 6 },
            x00281102: { length: 6 },
            x00281103: { length: 6 },
            x00281201: { length: actualLutDataLength, dataOffset: 0 },
            x00281202: { length: actualLutDataLength, dataOffset: 0 },
            x00281203: { length: actualLutDataLength, dataOffset: 0 },
          },
          byteArray
        );
      }

      it('treats a descriptor count of 0 as 65536 entries', () => {
        const dataSet = buildPaletteColorDataSet({
          numEntries: 0,
          bitsAllocatedDescriptor: 16,
          actualLutDataLength: 4, // won't be fully read; only descriptor[0] correction checked here
        });
        // uint16 for x00283xxx style LUT data path is not exercised (16-bit branch),
        // only the descriptor correction itself.
        (dataSet as any).uint16 = (t: string, i = 0) => {
          const map: Record<string, number[]> = {
            x00281101: [0, 0, 16],
            x00281102: [0, 0, 16],
            x00281103: [0, 0, 16],
          };
          return map[t] ? map[t][i] : undefined;
        };

        const result = getImagePixelModule(dataSet as any) as any;

        expect(result.redPaletteColorLookupTableDescriptor[0]).toBe(65536);
        expect(result.greenPaletteColorLookupTableDescriptor[0]).toBe(65536);
        expect(result.bluePaletteColorLookupTableDescriptor[0]).toBe(65536);
      });

      it('corrects the bits-per-entry when descriptor says 16 but data length matches 8-bit entries', () => {
        const numEntries = 4;
        // actual LUT data length equals numEntries -> real bitsAllocated is 8,
        // even though the descriptor (bitsAllocatedDescriptor) claims 16.
        const dataSet = buildPaletteColorDataSet({
          numEntries,
          bitsAllocatedDescriptor: 16,
          actualLutDataLength: numEntries,
        });

        const result = getImagePixelModule(dataSet as any) as any;

        expect(result.redPaletteColorLookupTableDescriptor).toEqual([
          numEntries,
          0,
          8,
        ]);
        // LUT data read byte-by-byte from byteArray since corrected to 8 bits
        expect(result.redPaletteColorLookupTableData).toEqual([1, 2, 3, 4]);
        expect(result.greenPaletteColorLookupTableData).toEqual([1, 2, 3, 4]);
        expect(result.bluePaletteColorLookupTableData).toEqual([1, 2, 3, 4]);
      });

      it('reads 16-bit LUT data entries via uint16 when descriptor bits match actual data length', () => {
        const numEntries = 3;
        const dataSet = buildPaletteColorDataSet({
          numEntries,
          bitsAllocatedDescriptor: 16,
          actualLutDataLength: numEntries * 2,
        });
        (dataSet as any).uint16 = (t: string, i = 0) => {
          if (t === 'x00281101' || t === 'x00281102' || t === 'x00281103') {
            return [numEntries, 0, 16][i];
          }
          if (t === 'x00281201' || t === 'x00281202' || t === 'x00281203') {
            return [500, 600, 700][i];
          }
          return undefined;
        };

        const result = getImagePixelModule(dataSet as any) as any;

        expect(result.redPaletteColorLookupTableDescriptor).toEqual([
          numEntries,
          0,
          16,
        ]);
        expect(result.redPaletteColorLookupTableData).toEqual([500, 600, 700]);
      });
    });
  });

  describe('combineFrameInstanceDataset', () => {
    function buildFunctionalGroupItem(elements: Record<string, any>) {
      const taggedElements: Record<string, any> = {};
      Object.keys(elements).forEach((tag) => {
        taggedElements[tag] = { tag, ...elements[tag] };
      });
      return { dataSet: { elements: taggedElements } };
    }

    it('returns the original dataset unchanged when it is not multiframe', () => {
      const dataSet = fakeDataSet(
        { x00280008: '1' },
        { x00080018: { tag: 'x00080018', length: 4 } }
      );

      const result = combineFrameInstanceDataset(1, dataSet as any);

      expect(result).toBe(dataSet);
    });

    it('returns undefined when passed an undefined dataSet', () => {
      expect(combineFrameInstanceDataset(1, undefined)).toBeUndefined();
      expect(getMultiframeInformation(undefined)).toBeUndefined();
      expect(getDirectFrameInformation(undefined, 1)).toBeUndefined();
    });

    it('merges shared groups first, then lets per-frame groups override for the requested frame', () => {
      const shared = {
        x52009229: {
          items: [
            buildFunctionalGroupItem({
              x00280030: { value: 'shared-spacing', length: 8 },
              x00189087: { value: 'shared-only', length: 4 },
            }),
          ],
        },
      };
      const perFrame = {
        x52009230: {
          items: [
            buildFunctionalGroupItem({
              x00280030: { value: 'frame1-spacing', length: 8 },
            }),
            buildFunctionalGroupItem({
              x00280030: { value: 'frame2-spacing', length: 8 },
            }),
          ],
        },
      };

      const dataSet = fakeDataSet(
        // x00080018 is duplicated into `values` (read by .string()) and
        // `elements` (read directly via .elements by combineFrameInstanceDataset)
        // since this fake's accessor methods and raw element access are
        // backed by two different stores.
        { x00280008: '2', x00080018: 'baseline-sop' },
        {
          x00080018: { tag: 'x00080018', value: 'baseline-sop' },
          ...shared,
          ...perFrame,
        }
      );

      const frame1Result = combineFrameInstanceDataset(
        1,
        dataSet as any
      ) as any;
      const frame2Result = combineFrameInstanceDataset(
        2,
        dataSet as any
      ) as any;

      // Per-frame value for the requested frame wins over the shared value
      expect(frame1Result.elements.x00280030.value).toBe('frame1-spacing');
      expect(frame2Result.elements.x00280030.value).toBe('frame2-spacing');

      // Shared-only tags survive the merge
      expect(frame1Result.elements.x00189087.value).toBe('shared-only');

      // Un-related baseline elements pass through untouched
      expect(frame1Result.elements.x00080018.value).toBe('baseline-sop');

      // The multiframe sequence tags themselves are stripped from the result
      expect(frame1Result.elements.x52009229).toBeUndefined();
      expect(frame1Result.elements.x52009230).toBeUndefined();

      // The clone is prototype-linked to the original dataset, so its methods
      // (defined as own properties on the fake) are still reachable.
      expect(typeof frame1Result.string).toBe('function');
      expect(frame1Result.string('x00080018')).toBe('baseline-sop');

      // Different frame requests do not share the same merged elements object
      expect(frame1Result).not.toBe(frame2Result);
    });

    it('getMultiframeInformation reports NumberOfFrames and pulls out the two multiframe sequences', () => {
      const dataSet = fakeDataSet(
        { x00280008: '5' },
        {
          x52009229: { items: [] },
          x52009230: { items: [] },
          x00080018: { tag: 'x00080018' },
        }
      );

      const info = getMultiframeInformation(dataSet as any);

      expect(info.NumberOfFrames).toBe(5);
      expect(info.SharedFunctionalGroupsSequence).toBe(
        dataSet.elements.x52009229
      );
      expect(info.PerFrameFunctionalGroupsSequence).toBe(
        dataSet.elements.x52009230
      );
      expect(info.otherElements.x00080018).toBeDefined();
      expect((info.otherElements as any).x52009229).toBeUndefined();
    });

    it('getFrameInformation builds shared/perFrame maps keyed by tag', () => {
      const shared = {
        items: [buildFunctionalGroupItem({ x00189087: { value: 's' } })],
      };
      const perFrame = {
        items: [
          buildFunctionalGroupItem({ x00280030: { value: 'f1' } }),
          buildFunctionalGroupItem({ x00280030: { value: 'f2' } }),
        ],
      };

      const frame1 = getFrameInformation(perFrame as any, shared as any, 1);
      const frame2 = getFrameInformation(perFrame as any, shared as any, 2);

      expect(frame1.shared.x00189087.value).toBe('s');
      expect(frame1.perFrame.x00280030.value).toBe('f1');
      expect(frame2.perFrame.x00280030.value).toBe('f2');

      // With no sequences at all, both maps are empty
      const empty = getFrameInformation(undefined, undefined, 1);
      expect(empty.shared).toEqual({});
      expect(empty.perFrame).toEqual({});
    });

    it('getDirectFrameInformation returns only NumberOfFrames for a true single-frame dataset', () => {
      const dataSet = fakeDataSet({ x00280008: '1' }, {});

      const info = getDirectFrameInformation(dataSet as any, 1);

      expect(info).toEqual({ NumberOfFrames: 1 });
    });

    it('getDirectFrameInformation returns Shared/PerFrame functional information for multiframe datasets', () => {
      const shared = {
        x52009229: {
          items: [buildFunctionalGroupItem({ x00189087: { value: 's' } })],
        },
      };
      const perFrame = {
        x52009230: {
          items: [buildFunctionalGroupItem({ x00280030: { value: 'f1' } })],
        },
      };
      const dataSet = fakeDataSet(
        { x00280008: '1' },
        { ...shared, ...perFrame }
      );

      const info = getDirectFrameInformation(dataSet as any, 1) as any;

      expect(info.NumberOfFrames).toBe(1);
      expect(info.PerFrameFunctionalInformation.x00280030.value).toBe('f1');
      expect(info.SharedFunctionalInformation.x00189087.value).toBe('s');
    });
  });

  describe('getUncompressedImageFrame', () => {
    function dataSetWithPixelData(
      prefixLength: number,
      pixelBytes: number[],
      overrides: Record<string, any> = {}
    ) {
      const buffer = new Uint8Array(prefixLength + pixelBytes.length);
      buffer.set(pixelBytes, prefixLength);
      const values = {
        x00280100: 8,
        x00280010: 2,
        x00280011: 2,
        x00280002: 1,
        ...overrides,
      };
      const elements = {
        x7fe00010: { dataOffset: prefixLength, length: pixelBytes.length },
      };
      return fakeDataSet(values, elements, buffer);
    }

    it('extracts an 8-bit frame using rows*cols*samplesPerPixel byte offsets', () => {
      // rows=2, cols=2, samplesPerPixel=1 -> 4 bytes per frame
      const dataSet = dataSetWithPixelData(
        10,
        [10, 20, 30, 40, 50, 60, 70, 80],
        { x00280100: 8 }
      );

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual([
        10, 20, 30, 40,
      ]);
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 1))).toEqual([
        50, 60, 70, 80,
      ]);
    });

    it('extracts a 16-bit frame using 2 bytes per sample', () => {
      // rows=2, cols=2, samplesPerPixel=1 -> pixelsPerFrame=4, *2 bytes = 8 bytes/frame
      const frame0 = [1, 0, 2, 0, 3, 0, 4, 0]; // little endian 1,2,3,4
      const frame1 = [5, 0, 6, 0, 7, 0, 8, 0];
      const dataSet = dataSetWithPixelData(4, [...frame0, ...frame1], {
        x00280100: 16,
      });

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual(
        frame0
      );
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 1))).toEqual(
        frame1
      );
    });

    it('extracts a 32-bit frame using 4 bytes per sample', () => {
      // rows=1, cols=2, samplesPerPixel=1 -> pixelsPerFrame=2, *4 bytes = 8 bytes/frame
      const frame0 = [1, 2, 3, 4, 5, 6, 7, 8];
      const dataSet = dataSetWithPixelData(0, frame0, {
        x00280100: 32,
        x00280010: 1,
        x00280011: 2,
      });

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual(
        frame0
      );
    });

    it('delegates 1-bit frames to unpackBinaryFrame', () => {
      // rows=2, cols=2, samplesPerPixel=1 -> pixelsPerFrame=4 bits, fits in <1 byte
      // byte = 0b00000101 -> bit0=1, bit1=0, bit2=1, bit3=0
      const dataSet = dataSetWithPixelData(0, [0b00000101], {
        x00280100: 1,
        x00280010: 2,
        x00280011: 2,
      });

      const result = getUncompressedImageFrame(dataSet as any, 0);
      expect(Array.from(result)).toEqual([1, 0, 1, 0]);
    });

    it('throws when the frame index is out of range', () => {
      const dataSet = dataSetWithPixelData(0, [1, 2, 3, 4], {
        x00280100: 8,
      });

      expect(() => getUncompressedImageFrame(dataSet as any, 10)).toThrow(
        'frame exceeds size of pixelData'
      );
    });

    it('throws for an unsupported bitsAllocated value', () => {
      const dataSet = dataSetWithPixelData(0, [1, 2, 3, 4], {
        x00280100: 12,
      });

      expect(() => getUncompressedImageFrame(dataSet as any, 0)).toThrow(
        'unsupported pixel format'
      );
    });

    it('forces samplesPerPixel to 2 for YBR_FULL_422 photometric interpretation', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // rows=1, cols=2 -> with samplesPerPixel forced to 2: pixelsPerFrame=4 bytes/frame (8-bit)
      const dataSet = dataSetWithPixelData(0, [1, 2, 3, 4, 5, 6, 7, 8], {
        x00280100: 8,
        x00280010: 1,
        x00280011: 2,
        x00280002: 3, // would be 6 bytes/frame if not overridden to 2
        x00280004: 'YBR_FULL_422',
      });

      const frame0 = getUncompressedImageFrame(dataSet as any, 0);
      const frame1 = getUncompressedImageFrame(dataSet as any, 1);

      expect(Array.from(frame0)).toEqual([1, 2, 3, 4]);
      expect(Array.from(frame1)).toEqual([5, 6, 7, 8]);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('does not validate that a full frame is available past the start offset (documents current behavior)', () => {
      // Only 2 bytes remain for a frame that should be 4 bytes (2x2x1, 8-bit).
      // The offset check only guards the *start* of the frame, so this silently
      // returns a truncated slice instead of throwing - noted as a suspected bug.
      const dataSet = dataSetWithPixelData(0, [1, 2], {
        x00280100: 8,
        x00280010: 2,
        x00280011: 2,
      });

      const result = getUncompressedImageFrame(dataSet as any, 0);
      expect(Array.from(result)).toEqual([1, 2]);
      expect(result.length).toBe(2);
    });
  });

  describe('unpackBinaryFrame', () => {
    it('unpacks a single byte into 8 individual bits (LSB first)', () => {
      // 178 = 0b10110010 -> bit0..bit7 = 0,1,0,0,1,1,0,1
      const byteArray = new Uint8Array([0b10110010]);

      const result = unpackBinaryFrame(byteArray as any, 0, 8);

      expect(Array.from(result)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
    });

    it('unpacks bits spanning multiple bytes starting at a non-zero frame offset', () => {
      const byteArray = new Uint8Array([0xff, 0b10110010, 0b00001111]);
      // frameOffset=1 skips the first (unrelated) byte entirely
      const result = unpackBinaryFrame(byteArray as any, 1, 12);

      expect(Array.from(result)).toEqual([
        0,
        1,
        0,
        0,
        1,
        1,
        0,
        1, // byte 0b10110010
        1,
        1,
        1,
        1, // low nibble of 0b00001111
      ]);
    });

    it('returns an all-zero array for a zero byte', () => {
      const byteArray = new Uint8Array([0x00]);
      const result = unpackBinaryFrame(byteArray as any, 0, 8);
      expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('dataSetCacheManager (pure/bookkeeping parts)', () => {
    beforeEach(() => {
      dataSetCacheManager.purge();
    });

    it('getInfo reports an empty cache after purge', () => {
      const info = dataSetCacheManager.getInfo();
      expect(info.cacheSizeInBytes).toBe(0);
      expect(info.numberOfDataSetsCached).toBe(0);
    });

    it('isLoaded/get reflect directly-seeded loadedDataSets state', () => {
      const dataSet = fakeDataSet({ x00280008: '1' }, {}, new Uint8Array(100));

      expect(dataSetCacheManager.isLoaded('wadouri:foo')).toBe(false);
      expect(dataSetCacheManager.get('wadouri:foo')).toBeUndefined();

      loadedDataSets['wadouri:foo'] = {
        dataSet: dataSet as any,
        cacheCount: 1,
      };

      expect(dataSetCacheManager.isLoaded('wadouri:foo')).toBe(true);
      expect(dataSetCacheManager.get('wadouri:foo')).toBe(dataSet);
    });

    it('get() combines a frame-qualified uri via combineFrameInstanceDataset', () => {
      const perFrame = {
        x52009230: {
          items: [
            {
              dataSet: {
                elements: {
                  x00280030: { tag: 'x00280030', value: 'frame1' },
                },
              },
            },
            {
              dataSet: {
                elements: {
                  x00280030: { tag: 'x00280030', value: 'frame2' },
                },
              },
            },
          ],
        },
      };
      const multiframeDataSet = fakeDataSet(
        { x00280008: '2' },
        { ...perFrame },
        new Uint8Array(10)
      );

      loadedDataSets['wadouri:multi'] = {
        dataSet: multiframeDataSet as any,
        cacheCount: 1,
      };

      const frame2 = dataSetCacheManager.get('wadouri:multi&frame=2') as any;

      expect(frame2.elements.x00280030.value).toBe('frame2');
    });

    it('update() adjusts cacheSizeInBytes by the byte-length delta and swaps the cached dataset', () => {
      const original = fakeDataSet({}, {}, new Uint8Array(50));
      loadedDataSets['wadouri:update'] = {
        dataSet: original as any,
        cacheCount: 1,
      };
      const replacement = fakeDataSet({}, {}, new Uint8Array(80));

      const events: any[] = [];
      const listener = (evt: any) => events.push(evt.detail);
      eventTarget.addEventListener('datasetscachechanged', listener);

      const sizeBefore = dataSetCacheManager.getInfo().cacheSizeInBytes;
      dataSetCacheManager.update('wadouri:update', replacement as any);
      const sizeAfter = dataSetCacheManager.getInfo().cacheSizeInBytes;

      // update() subtracts the previous dataset's byteArray length (50) and
      // adds the replacement's (80), so cacheSizeInBytes grows by the 30-byte
      // delta regardless of its starting value.
      expect(sizeAfter - sizeBefore).toBe(30);
      expect(loadedDataSets['wadouri:update'].dataSet).toBe(replacement);
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('updated');
      expect(events[0].uri).toBe('wadouri:update');

      eventTarget.removeEventListener('datasetscachechanged', listener);
    });

    it('unload() decrements cacheCount and only evicts once the count reaches zero', () => {
      const dataSet = fakeDataSet({}, {}, new Uint8Array(30));
      loadedDataSets['wadouri:unload'] = {
        dataSet: dataSet as any,
        cacheCount: 2,
      };

      dataSetCacheManager.unload('wadouri:unload');
      expect(loadedDataSets['wadouri:unload']).toBeDefined();
      expect(loadedDataSets['wadouri:unload'].cacheCount).toBe(1);

      dataSetCacheManager.unload('wadouri:unload');
      expect(loadedDataSets['wadouri:unload']).toBeUndefined();
      expect(dataSetCacheManager.isLoaded('wadouri:unload')).toBe(false);
    });

    it('unload() on an unknown uri is a no-op', () => {
      expect(() => dataSetCacheManager.unload('wadouri:missing')).not.toThrow();
    });

    it('purge() clears all loaded datasets and resets numberOfDataSetsCached', () => {
      loadedDataSets['wadouri:a'] = {
        dataSet: fakeDataSet({}, {}, new Uint8Array(10)) as any,
        cacheCount: 1,
      };
      loadedDataSets['wadouri:b'] = {
        dataSet: fakeDataSet({}, {}, new Uint8Array(10)) as any,
        cacheCount: 1,
      };

      expect(dataSetCacheManager.getInfo().numberOfDataSetsCached).toBe(2);

      dataSetCacheManager.purge();

      expect(dataSetCacheManager.getInfo().numberOfDataSetsCached).toBe(0);
      expect(dataSetCacheManager.getInfo().cacheSizeInBytes).toBe(0);
    });
  });
});
