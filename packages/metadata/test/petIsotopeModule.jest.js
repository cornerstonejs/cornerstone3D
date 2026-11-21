/**
 * petIsotopeModule on the default metadata path: the module is built from
 * the NATURALIZED instance by tagModules, with each item of the
 * Radiopharmaceutical Information Sequence (0054,0016) mapped through the
 * RadiopharmaceuticalInfo nested module.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { getMetaData, removeAllProviders } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import {
  setCacheData,
  clearCacheData,
} from '../src/utilities/metadataProvider/cacheData';
import { clearTagModules } from '../src/utilities/metadataProvider/tagModules';
import { addDicomWebInstance } from '../src/utilities/metadataProvider/addDicomPart10Instance';
import { MetadataModules } from '../src/enums';

const START_DATE_TIME = '20200101100000.000000';

/** DICOMweb JSON for a PT instance (only the attributes the module reads). */
function ptDicomwebJson() {
  return {
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.128'] },
    '00080018': { vr: 'UI', Value: ['1.2.3.4.5'] },
    '00080060': { vr: 'CS', Value: ['PT'] },
    '00540016': {
      vr: 'SQ',
      Value: [
        {
          '00181072': { vr: 'TM', Value: ['100000.000000'] },
          '00181074': { vr: 'DS', Value: [370000000] },
          '00181075': { vr: 'DS', Value: [6586.2] },
          '00181078': { vr: 'DT', Value: [START_DATE_TIME] },
        },
      ],
    },
  };
}

describe('petIsotopeModule (default metadata providers)', () => {
  beforeEach(() => {
    removeAllProviders();
    clearTagModules();
    clearCacheData();
    registerDefaultProviders();
  });

  it('includes radiopharmaceuticalStartDateTime for a DICOMweb JSON instance', () => {
    const imageId = 'wadors:https://example.com/studies/1/series/2/instances/3';
    addDicomWebInstance(imageId, ptDicomwebJson());

    const { radiopharmaceuticalInfo } = getMetaData(
      MetadataModules.PET_ISOTOPE,
      imageId
    );

    // Same field names and nesting as the legacy wadors metaDataProvider
    expect(radiopharmaceuticalInfo).toEqual({
      radiopharmaceuticalStartTime: '100000.000000',
      radiopharmaceuticalStartDateTime: START_DATE_TIME,
      radionuclideTotalDose: 370000000,
      radionuclideHalfLife: 6586.2,
    });
  });

  it('includes radiopharmaceuticalStartDateTime from a NATURALIZED instance', () => {
    const imageId = 'wadors:https://example.com/studies/1/series/2/instances/4';
    setCacheData(MetadataModules.NATURALIZED, imageId, {
      Modality: 'PT',
      RadiopharmaceuticalInfo: [
        {
          RadiopharmaceuticalStartDateTime: START_DATE_TIME,
          RadionuclideTotalDose: 370000000,
          RadionuclideHalfLife: 6586.2,
        },
      ],
    });

    const { radiopharmaceuticalInfo } = getMetaData(
      MetadataModules.PET_ISOTOPE,
      imageId
    );

    expect(radiopharmaceuticalInfo.radiopharmaceuticalStartDateTime).toBe(
      START_DATE_TIME
    );
    expect(radiopharmaceuticalInfo).not.toHaveProperty(
      'radiopharmaceuticalStartTime'
    );
  });

  it('maps radiopharmaceuticalStartDateTime for each item of a multi-item sequence', () => {
    const imageId = 'wadors:https://example.com/studies/1/series/2/instances/5';
    const json = ptDicomwebJson();
    json['00540016'].Value.push({
      '00181078': { vr: 'DT', Value: ['20200101110000'] },
    });
    addDicomWebInstance(imageId, json);

    const { radiopharmaceuticalInfo } = getMetaData(
      MetadataModules.PET_ISOTOPE,
      imageId
    );

    expect(radiopharmaceuticalInfo).toHaveLength(2);
    expect(radiopharmaceuticalInfo[0].radiopharmaceuticalStartDateTime).toBe(
      START_DATE_TIME
    );
    expect(radiopharmaceuticalInfo[1].radiopharmaceuticalStartDateTime).toBe(
      '20200101110000'
    );
  });

  it('omits radiopharmaceuticalStartDateTime when the instance has none', () => {
    const imageId = 'wadors:https://example.com/studies/1/series/2/instances/6';
    const json = ptDicomwebJson();
    delete json['00540016'].Value[0]['00181078'];
    addDicomWebInstance(imageId, json);

    const { radiopharmaceuticalInfo } = getMetaData(
      MetadataModules.PET_ISOTOPE,
      imageId
    );

    expect(radiopharmaceuticalInfo).not.toHaveProperty(
      'radiopharmaceuticalStartDateTime'
    );
    expect(radiopharmaceuticalInfo.radiopharmaceuticalStartTime).toBe(
      '100000.000000'
    );
  });
});
