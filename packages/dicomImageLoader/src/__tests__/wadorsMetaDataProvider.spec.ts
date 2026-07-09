/* eslint-disable @typescript-eslint/no-explicit-any */
import { Enums, metaData as coreMetaData } from '@cornerstonejs/core';
import metaDataProvider, {
  getImageUrlModule,
  getCineModule,
  getTransferSyntax,
} from '../imageLoader/wadors/metaData/metaDataProvider';
import metaDataManager from '../imageLoader/wadors/metaDataManager';

const { MetadataModules } = Enums;

const CT_IMAGE_ID =
  'wadors:https://server/studies/1.2.3.study/series/1.2.3.series/instances/1.2.3.instance/frames/1';

// A realistic CT-like fixture covering plane/pixel/LUT/series/study/patient tags.
function buildCTMetadata() {
  return {
    // General study
    '00081030': { vr: 'LO', Value: ['CT Chest'] },
    '00080020': { vr: 'DA', Value: ['20240101'] },
    '00080030': { vr: 'TM', Value: ['115000'] },
    '00080050': { vr: 'SH', Value: ['ACC001'] },
    // General series
    '00080060': { vr: 'CS', Value: ['CT'] },
    '0020000E': { vr: 'UI', Value: ['1.2.3.series'] },
    '0008103E': { vr: 'LO', Value: ['Chest CT'] },
    '00200011': { vr: 'IS', Value: ['3'] },
    '0020000D': { vr: 'UI', Value: ['1.2.3.study'] },
    '00080021': { vr: 'DA', Value: ['20240101'] },
    '00080031': { vr: 'TM', Value: ['120000'] },
    '00080022': { vr: 'DA', Value: ['20240101'] },
    '00080032': { vr: 'TM', Value: ['120500'] },
    // General image
    '00080018': { vr: 'UI', Value: ['1.2.3.sop'] },
    '00200013': { vr: 'IS', Value: ['5'] },
    '00282110': { vr: 'CS', Value: ['00'] },
    '00282112': { vr: 'DS', Value: ['10'] },
    '00282114': { vr: 'CS', Value: ['ISO_10918_1'] },
    // Patient
    '00100020': { vr: 'LO', Value: ['PAT001'] },
    '00100010': { vr: 'PN', Value: ['Doe^John'] },
    // Patient study
    '00101010': { vr: 'AS', Value: ['045Y'] },
    '00101020': { vr: 'DS', Value: ['1.8'] },
    '00100040': { vr: 'CS', Value: ['M'] },
    '00101030': { vr: 'DS', Value: ['70'] },
    // Image plane
    '00200052': { vr: 'UI', Value: ['1.2.3.for'] },
    '00280010': { vr: 'US', Value: [512] },
    '00280011': { vr: 'US', Value: [256] },
    '00200037': { vr: 'DS', Value: ['1', '0', '0', '0', '1', '0'] },
    '00200032': { vr: 'DS', Value: ['0', '0', '-100'] },
    '00180050': { vr: 'DS', Value: ['1.5'] },
    '00201041': { vr: 'DS', Value: ['-100'] },
    '00280030': { vr: 'DS', Value: ['0.5', '0.6'] },
    // Image pixel
    '00280002': { vr: 'US', Value: [1] },
    '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
    '00280100': { vr: 'US', Value: [16] },
    '00280101': { vr: 'US', Value: [12] },
    '00280102': { vr: 'US', Value: [11] },
    '00280103': { vr: 'US', Value: [0] },
    '00280006': { vr: 'US', Value: [0] },
    '00280034': { vr: 'IS', Value: ['1', '1'] },
    '00280106': { vr: 'US', Value: [0] },
    '00280107': { vr: 'US', Value: [4095] },
    // VOI LUT
    '00281050': { vr: 'DS', Value: ['40', '400'] },
    '00281051': { vr: 'DS', Value: ['400', '1500'] },
    '00281056': { vr: 'CS', Value: ['LINEAR'] },
    // Modality LUT
    '00281052': { vr: 'DS', Value: ['-1024'] },
    '00281053': { vr: 'DS', Value: ['1'] },
    '00281054': { vr: 'LO', Value: ['HU'] },
    // SOP common
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    // transfer syntax
    '00020010': { vr: 'UI', Value: ['1.2.840.10008.1.2.1'] },
    // cine
    '00180040': { vr: 'IS', Value: ['30'] },
  };
}

describe('wadors metaDataProvider', () => {
  beforeEach(() => {
    metaDataManager.purge();
  });

  it('returns undefined when there is no metadata registered for the imageId', () => {
    const result = metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID);
    expect(result).toBeUndefined();
  });

  it('returns undefined for an unrecognized module type', () => {
    metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
    const result = metaDataProvider('someTotallyUnknownModule', CT_IMAGE_ID);
    expect(result).toBeUndefined();
  });

  describe('GENERAL_STUDY', () => {
    it('naturalizes study-level tags', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.GENERAL_STUDY,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        studyDescription: 'CT Chest',
        studyDate: '20240101',
        studyTime: '115000',
        accessionNumber: 'ACC001',
      });
    });

    it('falls back to undefined fields when tags are missing', () => {
      metaDataManager.add(CT_IMAGE_ID, {} as any);
      const result = metaDataProvider(
        MetadataModules.GENERAL_STUDY,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        studyDescription: undefined,
        studyDate: undefined,
        studyTime: undefined,
        accessionNumber: undefined,
      });
    });
  });

  describe('GENERAL_SERIES', () => {
    it('naturalizes series-level tags including numeric coercion', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.GENERAL_SERIES,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        modality: 'CT',
        seriesInstanceUID: '1.2.3.series',
        seriesDescription: 'Chest CT',
        seriesNumber: 3,
        studyInstanceUID: '1.2.3.study',
        seriesDate: '20240101',
        seriesTime: '120000',
        acquisitionDate: '20240101',
        acquisitionTime: '120500',
      });
      expect(typeof result.seriesNumber).toBe('number');
    });
  });

  describe('GENERAL_IMAGE', () => {
    it('naturalizes general image tags', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.GENERAL_IMAGE,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        sopInstanceUID: '1.2.3.sop',
        instanceNumber: 5,
        lossyImageCompression: '00',
        lossyImageCompressionRatio: 10,
        lossyImageCompressionMethod: 'ISO_10918_1',
      });
    });
  });

  describe('PATIENT', () => {
    it('naturalizes patient id/name', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.PATIENT, CT_IMAGE_ID);
      expect(result).toEqual({
        patientID: 'PAT001',
        patientName: 'Doe^John',
      });
    });
  });

  describe('PATIENT_STUDY', () => {
    it('naturalizes patient study tags with numeric coercion', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.PATIENT_STUDY,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        patientAge: 45,
        patientSize: 1.8,
        patientSex: 'M',
        patientWeight: 70,
      });
    });

    it('returns undefined fields when patient study tags are missing', () => {
      metaDataManager.add(CT_IMAGE_ID, {} as any);
      const result = metaDataProvider(
        MetadataModules.PATIENT_STUDY,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        patientAge: undefined,
        patientSize: undefined,
        patientSex: undefined,
        patientWeight: undefined,
      });
    });
  });

  describe('IMAGE_PLANE', () => {
    it('derives row/column cosines and pixel spacing when fully specified', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID);

      expect(result.frameOfReferenceUID).toBe('1.2.3.for');
      expect(result.rows).toBe(512);
      expect(result.columns).toBe(256);
      expect(result.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
      expect(result.rowCosines).toEqual([1, 0, 0]);
      expect(result.columnCosines).toEqual([0, 1, 0]);
      expect(result.imagePositionPatient).toEqual([0, 0, -100]);
      expect(result.sliceThickness).toBe(1.5);
      expect(result.sliceLocation).toBe(-100);
      expect(result.pixelSpacing).toEqual([0.5, 0.6]);
      expect(result.rowPixelSpacing).toBe(0.5);
      expect(result.columnPixelSpacing).toBe(0.6);
      expect(result.usingDefaultValues).toBe(false);
    });

    it('defaults pixel spacing to 1/1 and flags usingDefaultValues when PixelSpacing is missing', () => {
      const metadata = buildCTMetadata();
      delete metadata['00280030'];
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID);

      expect(result.pixelSpacing).toBeUndefined();
      expect(result.rowPixelSpacing).toBe(1);
      expect(result.columnPixelSpacing).toBe(1);
      expect(result.usingDefaultValues).toBe(true);
    });

    it('defaults orientation to identity cosines and flags usingDefaultValues when ImageOrientationPatient is missing (modality present)', () => {
      const metadata = buildCTMetadata();
      delete metadata['00200037'];
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID);

      expect(result.rowCosines).toEqual([1, 0, 0]);
      expect(result.columnCosines).toEqual([0, 1, 0]);
      expect(result.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
      expect(result.usingDefaultValues).toBe(true);
    });

    it('defaults position to [0, 0, 0] and flags usingDefaultValues when ImagePositionPatient is missing (modality present)', () => {
      const metadata = buildCTMetadata();
      delete metadata['00200032'];
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID);

      expect(result.imagePositionPatient).toEqual([0, 0, 0]);
      expect(result.usingDefaultValues).toBe(true);
    });

    it('[suspected product bug] throws instead of falling back when orientation AND modality (00080060) are both missing', () => {
      // extractOrientationFromMetadata() falls back to isNMModality(metaData),
      // which does `getValue(metaData['00080060']).includes('NM')` with no
      // guard for a missing/undefined Modality tag - this throws a
      // TypeError instead of gracefully falling back to default cosines.
      const metadata = buildCTMetadata();
      delete metadata['00200037'];
      delete metadata['00080060'];
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      expect(() =>
        metaDataProvider(MetadataModules.IMAGE_PLANE, CT_IMAGE_ID)
      ).toThrow(/Cannot read propert/);
    });
  });

  describe('IMAGE_PIXEL', () => {
    it('naturalizes pixel description tags', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.IMAGE_PIXEL, CT_IMAGE_ID);

      expect(result).toEqual({
        samplesPerPixel: 1,
        photometricInterpretation: 'MONOCHROME2',
        rows: 512,
        columns: 256,
        bitsAllocated: 16,
        bitsStored: 12,
        highBit: 11,
        pixelRepresentation: 0,
        planarConfiguration: 0,
        pixelAspectRatio: '1',
        smallestPixelValue: 0,
        largestPixelValue: 4095,
        redPaletteColorLookupTableDescriptor: undefined,
        greenPaletteColorLookupTableDescriptor: undefined,
        bluePaletteColorLookupTableDescriptor: undefined,
        redPaletteColorLookupTableData: undefined,
        greenPaletteColorLookupTableData: undefined,
        bluePaletteColorLookupTableData: undefined,
      });
    });

    it('includes palette color lookup tables when present', () => {
      const metadata = buildCTMetadata();
      metadata['00281101'] = { vr: 'US', Value: [256, 0, 16] };
      metadata['00281201'] = { vr: 'OW', Value: [0, 10, 20, 30] };
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(MetadataModules.IMAGE_PIXEL, CT_IMAGE_ID);
      expect(result.redPaletteColorLookupTableDescriptor).toEqual([256, 0, 16]);
      expect(result.redPaletteColorLookupTableData).toEqual([0, 10, 20, 30]);
    });
  });

  describe('VOI_LUT', () => {
    it('parses multi-valued windowCenter/windowWidth', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.VOI_LUT, CT_IMAGE_ID);
      expect(result).toEqual({
        windowCenter: [40, 400],
        windowWidth: [400, 1500],
        voiLUTFunction: 'LINEAR',
      });
    });

    it('returns undefined arrays when windowCenter/windowWidth tags are absent', () => {
      metaDataManager.add(CT_IMAGE_ID, {} as any);
      const result = metaDataProvider(MetadataModules.VOI_LUT, CT_IMAGE_ID);
      expect(result).toEqual({
        windowCenter: undefined,
        windowWidth: undefined,
        voiLUTFunction: undefined,
      });
    });
  });

  describe('MODALITY_LUT', () => {
    it('parses rescale slope/intercept/type', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.MODALITY_LUT,
        CT_IMAGE_ID
      );
      expect(result).toEqual({
        rescaleIntercept: -1024,
        rescaleSlope: 1,
        rescaleType: 'HU',
      });
    });
  });

  describe('SOP_COMMON', () => {
    it('naturalizes SOP class/instance UIDs', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.SOP_COMMON, CT_IMAGE_ID);
      expect(result).toEqual({
        sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
        sopInstanceUID: '1.2.3.sop',
      });
    });
  });

  describe('transferSyntax (getTransferSyntax)', () => {
    it('reads from 00020010 (FMI) when present', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider('transferSyntax', CT_IMAGE_ID);
      expect(result).toEqual({
        transferSyntaxUID: '1.2.840.10008.1.2.1',
      });
    });

    it('falls back to 00083002 when 00020010 is absent', () => {
      const metadata = buildCTMetadata();
      delete metadata['00020010'];
      metadata['00083002'] = { vr: 'UI', Value: ['1.2.840.10008.1.2'] };
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider('transferSyntax', CT_IMAGE_ID);
      expect(result).toEqual({ transferSyntaxUID: '1.2.840.10008.1.2' });
    });

    it('returns undefined transferSyntaxUID when neither tag is present', () => {
      metaDataManager.add(CT_IMAGE_ID, {} as any);
      const result = metaDataProvider('transferSyntax', CT_IMAGE_ID);
      expect(result).toEqual({ transferSyntaxUID: undefined });
    });

    it('exported getTransferSyntax works directly against a metaData object', () => {
      const metadata = buildCTMetadata();
      const result = getTransferSyntax(CT_IMAGE_ID, metadata);
      expect(result.transferSyntaxUID).toBe('1.2.840.10008.1.2.1');
    });
  });

  describe('getImageUrlModule / IMAGE_URL', () => {
    it('builds rendered/thumbnail URLs and detects non-video transfer syntax', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.IMAGE_URL, CT_IMAGE_ID);

      expect(result.isVideo).toBeFalsy();
      expect(result.thumbnail).toBe(
        'https://server/studies/1.2.3.study/series/1.2.3.series/instances/1.2.3.instance/thumbnail/1'
      );
      expect(result.rendered).toBe(
        'https://server/studies/1.2.3.study/series/1.2.3.series/instances/1.2.3.instance/rendered/1'
      );
    });

    it('detects a video transfer syntax and strips the frame number from rendered URL', () => {
      const metadata = buildCTMetadata();
      metadata['00020010'] = { vr: 'UI', Value: ['1.2.840.10008.1.2.4.100'] };
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = getImageUrlModule(CT_IMAGE_ID, metadata);
      expect(result.isVideo).toBeTruthy();
      expect(result.rendered).toBe(
        'https://server/studies/1.2.3.study/series/1.2.3.series/instances/1.2.3.instance/rendered'
      );
    });
  });

  describe('getCineModule / CINE', () => {
    it('naturalizes cine rate and number of frames', () => {
      const metadata = buildCTMetadata();
      metadata['00280008'] = { vr: 'IS', Value: ['1'] };
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(MetadataModules.CINE, CT_IMAGE_ID);
      expect(result).toEqual({ cineRate: '30', numberOfFrames: 1 });

      const direct = getCineModule(CT_IMAGE_ID, metadata);
      expect(direct).toEqual({ cineRate: '30', numberOfFrames: 1 });
    });
  });

  describe('OVERLAY_PLANE', () => {
    it('returns an empty overlays array for standard-format wadors tags (no x60xx-prefixed keys present)', () => {
      // getOverlayPlaneModule looks up keys like `x60003000`, which is the
      // dicom-parser (wadouri) tag-key convention, not the plain 8-hex-digit
      // uppercase tag convention ('60003000') used everywhere else in the
      // wadors metaData object shape. See suspected-bug note in the final
      // report: this means overlay data coming from a real WADO-RS server
      // (keyed the normal way) will never be found here.
      const metadata = buildCTMetadata();
      metadata['60003000'] = {
        vr: 'OW',
        Value: [{ dataOffset: 0, length: 1 }],
      };
      metaDataManager.add(CT_IMAGE_ID, metadata as any);

      const result = metaDataProvider(
        MetadataModules.OVERLAY_PLANE,
        CT_IMAGE_ID
      );
      expect(result).toEqual({ overlays: [] });
    });

    it('decodes overlay bit-packed pixel data when the internal x60xx-style keys are used', () => {
      const metadata: any = buildCTMetadata();
      metadata['x60000010'] = { Value: [8] };
      metadata['x60000011'] = { Value: [8] };
      metadata['x60000040'] = { Value: ['G'] };
      metadata['x60000050'] = { Value: [1, 1] };
      metadata['x60000022'] = { Value: ['a description'] };
      metadata['x60001500'] = { Value: ['a label'] };
      metadata['x60001301'] = { Value: [10] };
      metadata['x60001302'] = { Value: [5] };
      metadata['x60001303'] = { Value: [1] };
      metadata['x60003000'] = { Value: [{ dataOffset: 0, length: 1 }] };
      // getOverlayPlaneModule reads raw bytes off metaData.Value directly.
      metadata.Value = [0b00000101];
      metaDataManager.add(CT_IMAGE_ID, metadata);

      const result = metaDataProvider(
        MetadataModules.OVERLAY_PLANE,
        CT_IMAGE_ID
      );
      expect(result.overlays.length).toBe(1);
      const overlay = result.overlays[0];
      expect(overlay.rows).toBe(8);
      expect(overlay.columns).toBe(8);
      expect(overlay.type).toBe('G');
      expect(overlay.x).toBe(0); // getNumberValue(..., 1) - 1 = 1 - 1
      expect(overlay.y).toBe(0); // getNumberValue(..., 0) - 1 = 1 - 1
      expect(overlay.description).toBe('a description');
      expect(overlay.label).toBe('a label');
      expect(overlay.roiArea).toBe(10);
      expect(overlay.roiMean).toBe(5);
      expect(overlay.roiStandardDeviation).toBe(1);
      // 0b00000101 unpacked LSB-first across 8 bits.
      expect(overlay.pixelData).toEqual([1, 0, 1, 0, 0, 0, 0, 0]);
    });
  });

  describe('CALIBRATION / ULTRASOUND_ENHANCED_REGION', () => {
    function buildUSMetadata() {
      return {
        '00080060': { vr: 'CS', Value: ['US'] },
        '00186011': {
          vr: 'SQ',
          Value: [
            {
              '0018602C': { vr: 'FD', Value: [0.05] },
              '0018602E': { vr: 'FD', Value: [0.06] },
              '00186024': { vr: 'US', Value: [3] },
              '00186026': { vr: 'US', Value: [3] },
              '0018601A': { vr: 'US', Value: [0] },
              '0018601E': { vr: 'US', Value: [479] },
              '00186018': { vr: 'US', Value: [0] },
              '0018601C': { vr: 'US', Value: [639] },
              '00186020': { vr: 'US', Value: [10] },
              '00186022': { vr: 'US', Value: [20] },
              '0018602A': { vr: 'FD', Value: [0] },
              '00186028': { vr: 'FD', Value: [0] },
              '00186012': { vr: 'US', Value: [1] },
              '00186014': { vr: 'US', Value: [2] },
              '00186016': { vr: 'US', Value: [0] },
              '00186030': { vr: 'DS', Value: ['5000000'] },
            },
          ],
        },
      };
    }

    it('CALIBRATION returns sequenceOfUltrasoundRegions for US modality', () => {
      metaDataManager.add(CT_IMAGE_ID, buildUSMetadata() as any);
      const result = metaDataProvider(MetadataModules.CALIBRATION, CT_IMAGE_ID);

      expect(result.sequenceOfUltrasoundRegions.length).toBe(1);
      const region = result.sequenceOfUltrasoundRegions[0];
      expect(region.physicalDeltaX).toBe(0.05);
      expect(region.physicalDeltaY).toBe(0.06);
      expect(region.regionLocationMaxY1).toBe(479);
      expect(region.regionSpatialFormat).toBe(1);
      expect(region.transducerFrequency).toBe(5000000);
    });

    it('CALIBRATION returns undefined for a non-US modality', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(MetadataModules.CALIBRATION, CT_IMAGE_ID);
      expect(result).toBeUndefined();
    });

    it('ULTRASOUND_ENHANCED_REGION dispatches directly to getUSEnhancedRegions', () => {
      metaDataManager.add(CT_IMAGE_ID, buildUSMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.ULTRASOUND_ENHANCED_REGION,
        CT_IMAGE_ID
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it('ULTRASOUND_ENHANCED_REGION returns null when no regions are present', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.ULTRASOUND_ENHANCED_REGION,
        CT_IMAGE_ID
      );
      expect(result).toBeNull();
    });
  });

  describe('PET modules', () => {
    const PET_IMAGE_ID =
      'wadors:https://server/studies/1.2.pet/series/1.3.pet/instances/1.4.pet/frames/1';

    function buildPetMetadata() {
      return {
        '00080060': { vr: 'CS', Value: ['PT'] },
        '00540016': {
          vr: 'SQ',
          Value: [
            {
              '00181072': { vr: 'TM', Value: ['080000.00'] },
              '00181078': { vr: 'DT', Value: ['20240101080000'] },
              '00181074': { vr: 'DS', Value: ['370000000'] },
              '00181075': { vr: 'DS', Value: ['6586.2'] },
            },
          ],
        },
        '00280051': { vr: 'CS', Value: ['DECY', 'ATTN', 'SCAT'] },
        '00541001': { vr: 'CS', Value: ['BQML'] },
        '00541102': { vr: 'CS', Value: ['START'] },
        '00541300': { vr: 'DS', Value: ['1200'] },
        '00181242': { vr: 'IS', Value: ['180'] },
      };
    }

    it('PET_ISOTOPE parses the nested radiopharmaceutical information sequence', () => {
      metaDataManager.add(PET_IMAGE_ID, buildPetMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.PET_ISOTOPE,
        PET_IMAGE_ID
      );

      expect(result).toEqual({
        radiopharmaceuticalInfo: {
          radiopharmaceuticalStartTime: '080000.00',
          radiopharmaceuticalStartDateTime: '20240101080000',
          radionuclideTotalDose: 370000000,
          radionuclideHalfLife: 6586.2,
        },
      });
    });

    it('PET_ISOTOPE returns undefined when the radiopharmaceutical sequence is absent', () => {
      metaDataManager.add(PET_IMAGE_ID, {} as any);
      const result = metaDataProvider(
        MetadataModules.PET_ISOTOPE,
        PET_IMAGE_ID
      );
      expect(result).toBeUndefined();
    });

    it('PET_SERIES joins multi-valued CorrectedImage with backslashes', () => {
      metaDataManager.add(PET_IMAGE_ID, buildPetMetadata() as any);
      const result = metaDataProvider(MetadataModules.PET_SERIES, PET_IMAGE_ID);
      expect(result).toEqual({
        correctedImage: 'DECY\\ATTN\\SCAT',
        units: 'BQML',
        decayCorrection: 'START',
      });
    });

    it('PET_SERIES falls back to raw getValue when CorrectedImage is a single value', () => {
      const metadata = buildPetMetadata();
      metadata['00280051'] = { vr: 'CS', Value: ['DECY'] };
      metaDataManager.add(PET_IMAGE_ID, metadata as any);
      const result = metaDataProvider(MetadataModules.PET_SERIES, PET_IMAGE_ID);
      expect(result.correctedImage).toBe('DECY');
    });

    it('PET_IMAGE naturalizes frame reference time and actual frame duration', () => {
      metaDataManager.add(PET_IMAGE_ID, buildPetMetadata() as any);
      const result = metaDataProvider(MetadataModules.PET_IMAGE, PET_IMAGE_ID);
      expect(result).toEqual({
        frameReferenceTime: 1200,
        actualFrameDuration: 180,
      });
    });
  });

  describe('NM_MULTIFRAME_GEOMETRY', () => {
    const NM_IMAGE_ID =
      'wadors:https://server/studies/1.2.nm/series/1.3.nm/instances/1.4.nm/frames/1';

    function buildNMMetadata() {
      return {
        '00080060': { vr: 'CS', Value: ['NM'] },
        '00080008': {
          vr: 'CS',
          Value: ['ORIGINAL', 'PRIMARY', 'RECON TOMO'],
        },
        '00180050': { vr: 'DS', Value: ['4.5'] },
        '00180088': { vr: 'DS', Value: ['4.5'] },
        '00280030': { vr: 'DS', Value: ['2.5', '2.5'] },
        '00280008': { vr: 'IS', Value: ['60'] },
        // No top-level orientation/position - pulled from Detector Information Sequence.
        '00540022': {
          vr: 'SQ',
          Value: [
            {
              '00200037': {
                vr: 'DS',
                Value: ['1', '0', '0', '0', '1', '0'],
              },
              '00200032': { vr: 'DS', Value: ['10', '20', '30'] },
            },
          ],
        },
      };
    }

    it('extracts geometry from the Detector Information Sequence for RECON TOMO images', () => {
      metaDataManager.add(NM_IMAGE_ID, buildNMMetadata() as any);
      const result = metaDataProvider(
        MetadataModules.NM_MULTIFRAME_GEOMETRY,
        NM_IMAGE_ID
      );

      expect(result.modality).toBe('NM');
      // getValue() (not getNumberValues/getSequenceItems) only returns the
      // first element of the Value array, not the full ImageType array.
      expect(result.imageType).toBe('ORIGINAL');
      expect(result.imageSubType).toBe('RECON TOMO');
      expect(result.imageOrientationPatient).toEqual([1, 0, 0, 0, 1, 0]);
      expect(result.imagePositionPatient).toEqual([10, 20, 30]);
      expect(result.sliceThickness).toBe(4.5);
      expect(result.spacingBetweenSlices).toBe(4.5);
      expect(result.pixelSpacing).toEqual([2.5, 2.5]);
      expect(result.numberOfFrames).toBe(60);
      expect(result.isNMReconstructable).toBe(true);
    });

    it('is not reconstructable when the image subtype is not RECON TOMO/RECON GATED TOMO', () => {
      const metadata = buildNMMetadata();
      metadata['00080008'] = {
        vr: 'CS',
        Value: ['ORIGINAL', 'PRIMARY', 'STATIC'],
      };
      metaDataManager.add(NM_IMAGE_ID, metadata as any);

      const result = metaDataProvider(
        MetadataModules.NM_MULTIFRAME_GEOMETRY,
        NM_IMAGE_ID
      );
      expect(result.isNMReconstructable).toBe(false);
      // Orientation/position also come back undefined since the subtype
      // isn't reconstructable, so the Detector Information Sequence path
      // is skipped and there's no top-level orientation tag either.
      expect(result.imageOrientationPatient).toBeUndefined();
      expect(result.imagePositionPatient).toBeUndefined();
    });

    it('prefers top-level orientation/position tags over the Detector Information Sequence when present', () => {
      const metadata = buildNMMetadata();
      metadata['00200037'] = {
        vr: 'DS',
        Value: ['0', '1', '0', '-1', '0', '0'],
      };
      metadata['00200032'] = { vr: 'DS', Value: ['1', '2', '3'] };
      metaDataManager.add(NM_IMAGE_ID, metadata as any);

      const result = metaDataProvider(
        MetadataModules.NM_MULTIFRAME_GEOMETRY,
        NM_IMAGE_ID
      );
      expect(result.imageOrientationPatient).toEqual([0, 1, 0, -1, 0, 0]);
      expect(result.imagePositionPatient).toEqual([1, 2, 3]);
    });
  });

  describe('MULTIFRAME', () => {
    const MF_IMAGE_ID =
      'wadors:https://server/studies/1.2.mf/series/1.3.mf/instances/1.4.mf/frames/1';
    const MF_IMAGE_ID_FRAME2 =
      'wadors:https://server/studies/1.2.mf/series/1.3.mf/instances/1.4.mf/frames/2';

    it('returns NumberOfFrames only when there is no per-frame functional groups sequence', () => {
      metaDataManager.add(MF_IMAGE_ID, {
        '00280008': { vr: 'IS', Value: ['1'] },
      } as any);

      const result = metaDataProvider(MetadataModules.MULTIFRAME, MF_IMAGE_ID);
      expect(result).toEqual({ NumberOfFrames: '1' });
    });

    it('returns undefined when there is no metadata registered at all for the frameless imageId', () => {
      const result = metaDataProvider(MetadataModules.MULTIFRAME, MF_IMAGE_ID);
      expect(result).toBeUndefined();
    });

    it('splits shared/per-frame functional groups when NumberOfFrames > 1', () => {
      metaDataManager.add(MF_IMAGE_ID, {
        '00280008': { vr: 'IS', Value: ['2'] },
        '52009229': {
          vr: 'SQ',
          Value: [
            {
              '00280030': { Value: [{ '00280030': { Value: ['1', '1'] } }] },
            },
          ],
        },
        '52009230': {
          vr: 'SQ',
          Value: [
            {
              '00200032': {
                Value: [{ '00200032': { Value: ['0', '0', '0'] } }],
              },
            },
            {
              '00200032': {
                Value: [{ '00200032': { Value: ['0', '0', '10'] } }],
              },
            },
          ],
        },
      } as any);

      const result = metaDataProvider(
        MetadataModules.MULTIFRAME,
        MF_IMAGE_ID_FRAME2
      );
      expect(result.NumberOfFrames).toBe('2');
      expect(Array.isArray(result.SharedFunctionalInformation)).toBe(true);
      expect(Array.isArray(result.PerFrameFunctionalInformation)).toBe(true);
      expect(result.SharedFunctionalInformation.length).toBe(1);
      expect(result.PerFrameFunctionalInformation.length).toBe(1);
    });
  });

  describe("'instance' aggregation", () => {
    afterEach(() => {
      coreMetaData.removeAllProviders();
    });

    it('returns {} when no metadata provider has been registered with core', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      const result = metaDataProvider('instance', CT_IMAGE_ID);
      expect(result).toEqual({});
    });

    it('aggregates and capitalizes fields from the underlying modules once registered as a core provider', () => {
      metaDataManager.add(CT_IMAGE_ID, buildCTMetadata() as any);
      coreMetaData.addProvider(metaDataProvider);

      const result = metaDataProvider('instance', CT_IMAGE_ID) as Record<
        string,
        unknown
      >;

      expect(result.RescaleIntercept).toBe(-1024);
      expect(result.RescaleSlope).toBe(1);
      expect(result.SOPInstanceUID).toBe('1.2.3.sop');
      expect(result.SOPClassUID).toBe('1.2.840.10008.5.1.4.1.1.2');
      expect(result.WindowCenter).toEqual([40, 400]);
      expect(result.VOILUTFunction).toBe('LINEAR');
    });
  });
});
