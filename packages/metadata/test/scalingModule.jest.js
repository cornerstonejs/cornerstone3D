/**
 * Unit tests for the scalingModule typed provider (PT and RTDOSE).
 * The provider expects instance or natural data in the chain's data field; the
 * default registration uses naturalLookup (see registerDataLookup), so we
 * prime the NATURALIZED cache and the lookup passes that data into the provider.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { getMetaData, removeAllProviders } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import {
  setCacheData,
  clearCacheData,
} from '../src/utilities/metadataProvider/cacheData';
import { MetadataModules } from '../src/enums';

const RT_DOSE_BASE_IMAGE_ID =
  'wadors:https://example.com/studies/1/series/2/instances/3';
const RT_DOSE_IMAGE_ID = `${RT_DOSE_BASE_IMAGE_ID}/frames/1`;
const PT_BASE_IMAGE_ID =
  'wadors:https://example.com/studies/1/series/4/instances/5';
const PT_IMAGE_ID = `${PT_BASE_IMAGE_ID}/frames/1`;

describe('scalingModule typed provider', () => {
  beforeEach(() => {
    removeAllProviders();
    clearCacheData();
    registerDefaultProviders();
  });

  describe('RTDOSE', () => {
    it('returns scalingModule with DoseGridScaling, DoseSummation, DoseType, DoseUnit from NATURALIZED', () => {
      // NATURALIZED is keyed by base imageId (no frame number)
      setCacheData(MetadataModules.NATURALIZED, RT_DOSE_BASE_IMAGE_ID, {
        Modality: 'RTDOSE',
        DoseGridScaling: 2.5,
        DoseSummation: 'PLAN',
        DoseType: 'PHYSICAL',
        DoseUnit: 'GY',
      });

      // scaling is requested for a frame-specific imageId; NATURALIZED is resolved
      // via baseImageIdQueryFilter + naturalLookup
      const result = getMetaData(MetadataModules.SCALING, RT_DOSE_IMAGE_ID);

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        DoseGridScaling: 2.5,
        DoseSummation: 'PLAN',
        DoseType: 'PHYSICAL',
        DoseUnit: 'GY',
      });
    });

    it('returns undefined when NATURALIZED has no dose fields', () => {
      setCacheData(MetadataModules.NATURALIZED, RT_DOSE_BASE_IMAGE_ID, {
        Modality: 'RTDOSE',
      });

      const result = getMetaData(MetadataModules.SCALING, RT_DOSE_IMAGE_ID);

      expect(result).toBeUndefined();
    });
  });

  describe('PT', () => {
    it('returns scalingModule with suvbw from NATURALIZED PT instance (data passed via naturalLookup)', () => {
      // NATURALIZED is keyed by base imageId (no frame number)
      setCacheData(MetadataModules.NATURALIZED, PT_BASE_IMAGE_ID, {
        Modality: 'PT',
        SeriesDate: '20200101',
        SeriesTime: '120000',
        AcquisitionDate: '20200101',
        AcquisitionTime: '120000',
        PatientWeight: 70,
        // CorrectedImage must include ATTN and DECY for calculate-suv
        CorrectedImage: 'ATTN\\DECY\\NORM',
        Units: 'BQML',
        DecayCorrection: 'ADMIN',
        RadiopharmaceuticalInfo: [
          {
            RadionuclideTotalDose: 400000000,
            RadionuclideHalfLife: 6588,
            RadiopharmaceuticalStartDateTime: '20200101100000.000000',
          },
        ],
      });

      // scaling is requested for a frame-specific imageId; NATURALIZED is resolved
      // via baseImageIdQueryFilter + naturalLookup
      const result = getMetaData(MetadataModules.SCALING, PT_IMAGE_ID);

      expect(result).toBeDefined();
      expect(typeof result.suvbw).toBe('number');
      expect(result.suvbw).toBeGreaterThan(0);
      expect(result).toHaveProperty('suvbw');
    });

    it('returns undefined when modality is not PT or RTDOSE', () => {
      setCacheData(MetadataModules.NATURALIZED, 'ct-image-id', {
        Modality: 'CT',
      });

      const result = getMetaData(MetadataModules.SCALING, 'ct-image-id');

      expect(result).toBeUndefined();
    });
  });
});
