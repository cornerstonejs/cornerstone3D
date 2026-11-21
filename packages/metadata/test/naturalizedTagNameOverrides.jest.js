/**
 * Tags with a cornerstone name that differs from the dcmjs keyword (the
 * `[name, hexOverride]` entries in utilities/modules) must be naturalized
 * under the cornerstone name on every ingestion path, because the module
 * providers and scalingFromInstance read them by that name.
 *
 * The Part 10 path (`addDicomPart10Instance`, used by the default wadouri
 * loader `loadImageFromNaturalizedMetadata`) parses with the dcmjs
 * AsyncDicomReader, which passes the dcmjs keyword as `tagInfo.name`.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import dcmjs from 'dcmjs';
import * as metaData from '../src/metaData';
import { getMetaData, removeAllProviders } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import { clearCacheData } from '../src/utilities/metadataProvider/cacheData';
import {
  addDicomPart10Instance,
  addDicomWebInstance,
} from '../src/utilities/metadataProvider/addDicomPart10Instance';
import { MetadataModules } from '../src/enums';

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const PT_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.128';
const US_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.6.1';

/** Writes a naturalized (dcmjs keyword) dataset as an explicit VR LE Part 10 buffer. */
function writePart10(dataset) {
  const meta = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: dataset.SOPClassUID,
    MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
    TransferSyntaxUID: '1.2.840.10008.1.2.1',
    ImplementationClassUID: '1.2.826.0.1.3680043.9.7433.1.1',
  };
  const dicomDict = new DicomDict(
    DicomMetaDictionary.denaturalizeDataset(meta)
  );
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  return dicomDict.write();
}

function ptDataset() {
  return {
    SOPClassUID: PT_SOP_CLASS_UID,
    SOPInstanceUID: '1.2.3.4.5.6.1',
    Modality: 'PT',
    SeriesDate: '20200101',
    SeriesTime: '120000',
    AcquisitionDate: '20200101',
    AcquisitionTime: '120000',
    PatientWeight: 70,
    PatientSize: 1.75,
    PatientSex: 'F',
    CorrectedImage: ['ATTN', 'DECY'],
    Units: 'BQML',
    DecayCorrection: 'START',
    RadiopharmaceuticalInformationSequence: [
      {
        RadiopharmaceuticalStartTime: '100000',
        RadionuclideTotalDose: 400000000,
        RadionuclideHalfLife: 6588,
      },
    ],
    SamplesPerPixel: 1,
    PhotometricInterpretation: 'MONOCHROME2',
    Rows: 2,
    Columns: 2,
    BitsAllocated: 16,
    BitsStored: 16,
    HighBit: 15,
    PixelRepresentation: 0,
    SmallestImagePixelValue: 3,
    LargestImagePixelValue: 4095,
    PixelData: new Uint16Array([3, 10, 100, 4095]).buffer,
    _vrMap: {
      SmallestImagePixelValue: 'US',
      LargestImagePixelValue: 'US',
      PixelData: 'OW',
    },
  };
}

/** The same PT attributes as DICOMweb JSON. */
function ptDicomweb() {
  return {
    '00080016': { vr: 'UI', Value: [PT_SOP_CLASS_UID] },
    '00080018': { vr: 'UI', Value: ['1.2.3.4.5.6.1'] },
    '00080060': { vr: 'CS', Value: ['PT'] },
    '00080021': { vr: 'DA', Value: ['20200101'] },
    '00080031': { vr: 'TM', Value: ['120000'] },
    '00080022': { vr: 'DA', Value: ['20200101'] },
    '00080032': { vr: 'TM', Value: ['120000'] },
    '00101030': { vr: 'DS', Value: [70] },
    '00101020': { vr: 'DS', Value: [1.75] },
    '00100040': { vr: 'CS', Value: ['F'] },
    '00280051': { vr: 'CS', Value: ['ATTN', 'DECY'] },
    '00541001': { vr: 'CS', Value: ['BQML'] },
    '00541102': { vr: 'CS', Value: ['START'] },
    '00540016': {
      vr: 'SQ',
      Value: [
        {
          '00181072': { vr: 'TM', Value: ['100000'] },
          '00181074': { vr: 'DS', Value: [400000000] },
          '00181075': { vr: 'DS', Value: [6588] },
        },
      ],
    },
    '00280002': { vr: 'US', Value: [1] },
    '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
    '00280010': { vr: 'US', Value: [2] },
    '00280011': { vr: 'US', Value: [2] },
    '00280100': { vr: 'US', Value: [16] },
    '00280101': { vr: 'US', Value: [16] },
    '00280102': { vr: 'US', Value: [15] },
    '00280103': { vr: 'US', Value: [0] },
    '00280106': { vr: 'US', Value: [3] },
    '00280107': { vr: 'US', Value: [4095] },
  };
}

function usDataset() {
  return {
    SOPClassUID: US_SOP_CLASS_UID,
    SOPInstanceUID: '1.2.3.4.5.6.2',
    Modality: 'US',
    SequenceOfUltrasoundRegions: [
      {
        RegionSpatialFormat: 1,
        RegionDataType: 1,
        PhysicalUnitsXDirection: 3,
        PhysicalUnitsYDirection: 3,
        PhysicalDeltaX: 0.01,
        PhysicalDeltaY: 0.02,
        ReferencePixelX0: 10,
        ReferencePixelY0: 20,
        ReferencePixelPhysicalValueX: 1.5,
        ReferencePixelPhysicalValueY: -2.5,
      },
    ],
  };
}

function usDicomweb() {
  return {
    '00080016': { vr: 'UI', Value: [US_SOP_CLASS_UID] },
    '00080018': { vr: 'UI', Value: ['1.2.3.4.5.6.2'] },
    '00080060': { vr: 'CS', Value: ['US'] },
    '00186011': {
      vr: 'SQ',
      Value: [
        {
          '00186012': { vr: 'US', Value: [1] },
          '00186014': { vr: 'US', Value: [1] },
          '00186024': { vr: 'US', Value: [3] },
          '00186026': { vr: 'US', Value: [3] },
          '0018602C': { vr: 'FD', Value: [0.01] },
          '0018602E': { vr: 'FD', Value: [0.02] },
          '00186020': { vr: 'SL', Value: [10] },
          '00186022': { vr: 'SL', Value: [20] },
          '00186028': { vr: 'FD', Value: [1.5] },
          '0018602A': { vr: 'FD', Value: [-2.5] },
        },
      ],
    },
  };
}

const PT_PART10_IMAGE_ID = 'wadouri:https://example.com/pt.dcm';
const PT_DICOMWEB_IMAGE_ID =
  'wadors:https://example.com/studies/1/series/2/instances/3';
const US_PART10_IMAGE_ID = 'wadouri:https://example.com/us.dcm';
const US_DICOMWEB_IMAGE_ID =
  'wadors:https://example.com/studies/1/series/4/instances/5';

describe('naturalized names of Tags overrides', () => {
  beforeEach(() => {
    removeAllProviders();
    clearCacheData();
    registerDefaultProviders();
  });

  const ingestPt = {
    'Part 10 (addDicomPart10Instance)': async () => {
      await addDicomPart10Instance(
        PT_PART10_IMAGE_ID,
        writePart10(ptDataset())
      );
      return PT_PART10_IMAGE_ID;
    },
    'DICOMweb JSON (addDicomWebInstance)': async () => {
      addDicomWebInstance(PT_DICOMWEB_IMAGE_ID, ptDicomweb());
      return PT_DICOMWEB_IMAGE_ID;
    },
  };

  const ingestUs = {
    'Part 10 (addDicomPart10Instance)': async () => {
      await addDicomPart10Instance(
        US_PART10_IMAGE_ID,
        writePart10(usDataset())
      );
      return US_PART10_IMAGE_ID;
    },
    'DICOMweb JSON (addDicomWebInstance)': async () => {
      addDicomWebInstance(US_DICOMWEB_IMAGE_ID, usDicomweb());
      return US_DICOMWEB_IMAGE_ID;
    },
  };

  describe.each(Object.keys(ingestPt))('PT via %s', (path) => {
    it('stores the overridden tags under the cornerstone names', async () => {
      const imageId = await ingestPt[path]();
      const natural = getMetaData(MetadataModules.NATURALIZED, imageId);

      expect(natural.RadiopharmaceuticalInfo).toBeDefined();
      expect(natural.RadiopharmaceuticalInformationSequence).toBeUndefined();
      expect(natural.SmallestPixelValue).toBe(3);
      expect(natural.LargestPixelValue).toBe(4095);
      expect(natural.SmallestImagePixelValue).toBeUndefined();
      expect(natural.LargestImagePixelValue).toBeUndefined();
    });

    it('returns petIsotopeModule with radiopharmaceuticalInfo', async () => {
      const imageId = await ingestPt[path]();
      const petIsotope = getMetaData(MetadataModules.PET_ISOTOPE, imageId);

      expect(petIsotope.radiopharmaceuticalInfo).toMatchObject({
        radiopharmaceuticalStartTime: '100000',
        radionuclideTotalDose: 400000000,
        radionuclideHalfLife: 6588,
      });
    });

    it('returns scalingModule with suvbw', async () => {
      const imageId = await ingestPt[path]();
      const scaling = getMetaData(MetadataModules.SCALING, imageId);

      expect(scaling).toBeDefined();
      expect(typeof scaling.suvbw).toBe('number');
      expect(scaling.suvbw).toBeGreaterThan(0);
    });

    it('returns imagePixelModule with smallest/largest pixel value', async () => {
      const imageId = await ingestPt[path]();
      const imagePixel = getMetaData(MetadataModules.IMAGE_PIXEL, imageId);

      expect(imagePixel).toMatchObject({
        rows: 2,
        columns: 2,
        smallestPixelValue: 3,
        largestPixelValue: 4095,
      });
    });
  });

  it('produces the same suvbw from Part 10 and DICOMweb JSON', async () => {
    const part10Id = await ingestPt['Part 10 (addDicomPart10Instance)']();
    const dicomwebId = await ingestPt['DICOMweb JSON (addDicomWebInstance)']();

    const part10Scaling = getMetaData(MetadataModules.SCALING, part10Id);
    const dicomwebScaling = getMetaData(MetadataModules.SCALING, dicomwebId);

    expect(part10Scaling?.suvbw).toBeDefined();
    expect(part10Scaling.suvbw).toBeCloseTo(dicomwebScaling.suvbw, 10);
  });

  it('answers the metaData.get calls the image loaders make for PT scaling', async () => {
    // loadImageFromNaturalizedMetadata stores the fetched buffer with
    // addDicomPart10Instance; getScalingParameters then reads these modules
    // through metaData.get.
    const imageId = await ingestPt['Part 10 (addDicomPart10Instance)']();

    expect(metaData.get(MetadataModules.GENERAL_SERIES, imageId)).toMatchObject(
      { modality: 'PT' }
    );
    const scaling = metaData.get(MetadataModules.SCALING, imageId);
    expect(typeof scaling?.suvbw).toBe('number');
    expect(scaling.suvbw).toBeGreaterThan(0);
  });

  describe.each(Object.keys(ingestUs))('US via %s', (path) => {
    it('stores the reference physical pixel values under the cornerstone names', async () => {
      const imageId = await ingestUs[path]();
      const natural = getMetaData(MetadataModules.NATURALIZED, imageId);
      const [region] = natural.SequenceOfUltrasoundRegions;

      expect(region.ReferencePhysicalPixelValueX).toBe(1.5);
      expect(region.ReferencePhysicalPixelValueY).toBe(-2.5);
      expect(region.ReferencePixelPhysicalValueX).toBeUndefined();
      expect(region.ReferencePixelPhysicalValueY).toBeUndefined();
      expect(region.ReferencePixelX0).toBe(10);
      expect(region.PhysicalDeltaX).toBe(0.01);
    });
  });

  it('keeps dcmjs keywords for tags without an override', async () => {
    await addDicomPart10Instance(PT_PART10_IMAGE_ID, writePart10(ptDataset()));
    const natural = getMetaData(
      MetadataModules.NATURALIZED,
      PT_PART10_IMAGE_ID
    );

    expect(natural.Modality).toBe('PT');
    expect(natural.PatientWeight).toBe(70);
    expect(natural.CorrectedImage).toEqual(['ATTN', 'DECY']);
    expect(natural.SOPInstanceUID).toBe('1.2.3.4.5.6.1');
  });
});
