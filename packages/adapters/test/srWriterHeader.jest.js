import { describe, it, expect } from '@jest/globals';
import MeasurementReport from '../src/adapters/Cornerstone3D/MeasurementReport';
import { version } from '../src';

const imageId = 'wadors:/studies/1/series/2/instances/3/frames/1';

const metadataProvider = {
  get: (type) => {
    if (type === 'sopCommonModule') {
      return {
        sopInstanceUID: '1.2.3',
        sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
      };
    }
    if (type === 'instance') {
      return {
        StudyInstanceUID: '1',
        SeriesInstanceUID: '2',
        SOPInstanceUID: '1.2.3',
      };
    }
  },
};

describe('generateReport writer header', () => {
  it.each([
    [
      'no writer options',
      {},
      {
        Manufacturer: 'CornerstoneJS',
        ManufacturerModelName: '@cornerstonejs/adapters',
        SoftwareVersions: version,
      },
    ],
    [
      'writer options',
      {
        Manufacturer: 'OHIF',
        ManufacturerModelName: 'dcmjs',
        SoftwareVersions: ['OHIF 3.14.0', 'CS3D 5.13.2'],
      },
      {
        Manufacturer: 'OHIF',
        ManufacturerModelName: 'dcmjs',
        SoftwareVersions: ['OHIF 3.14.0', 'CS3D 5.13.2'],
      },
    ],
  ])('writes the header values for %s', (_name, options, expected) => {
    const callerOptions = { ...options };
    const report = MeasurementReport.generateReport(
      { [imageId]: {} },
      metadataProvider,
      callerOptions
    );

    expect(report.dataset).toMatchObject(expected);
    expect(callerOptions).toEqual(options);
  });
});
