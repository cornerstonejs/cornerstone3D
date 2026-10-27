import { describe, it, expect, jest } from '@jest/globals';

// Only the derived-labelmap image factory is stubbed, as in the SEG round-trip
// tests; everything else runs for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint16Array(16);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
          },
        };
      },
    },
  };
});

// The contour writer reads its annotations from the tool state.
const mockGetAnnotation = jest.fn();
jest.mock('@cornerstonejs/tools', () => {
  const actual = jest.requireActual('@cornerstonejs/tools');
  return {
    ...actual,
    annotation: {
      ...actual.annotation,
      state: { ...actual.annotation.state, getAnnotation: mockGetAnnotation },
    },
  };
});

const { metaData, Enums } = require('@cornerstonejs/core');
const MeasurementReport =
  require('../src/adapters/Cornerstone3D/MeasurementReport').default;
const LegacyMeasurementReport =
  require('../src/adapters/Cornerstone/MeasurementReport').default;
const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  generateRTSSFromRepresentation,
} = require('../src/adapters/Cornerstone3D/RTStruct/RTSS');
const { version } = require('../src');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  makeReferencedStack,
  buildLabelmap3D,
} = require('./helpers/segRoundTrip');

const SR_IMAGE_ID = 'wadors:/studies/1/series/2/instances/3/frames/1';

const srMetadataProvider = {
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

// prettier-ignore
const SHAPE = [
    1, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];

const writers = {
  'legacy SR': (options) =>
    LegacyMeasurementReport.generateReport(
      { [SR_IMAGE_ID]: {} },
      {
        get: (type) =>
          type === 'generalSeriesModule'
            ? { studyInstanceUID: '1', seriesInstanceUID: '2' }
            : srMetadataProvider.get(type),
      },
      options
    ).dataset,
  SR: (options) =>
    MeasurementReport.generateReport(
      { [SR_IMAGE_ID]: {} },
      srMetadataProvider,
      options
    ).dataset,
  'bitmap SEG': (options) => {
    const stack = makeReferencedStack(2);
    return generateSegmentation(
      stack.images,
      buildLabelmap3D(2, { 1: SHAPE }),
      stack.metadataProvider,
      options
    ).dataset;
  },
  'labelmap SEG': (options) => {
    const stack = makeReferencedStack(2);
    return generateSegmentation(
      stack.images,
      buildLabelmap3D(2, { 1: SHAPE }),
      stack.metadataProvider,
      { ...options, sopClassUID: LABELMAP_SEG_SOP_CLASS_UID }
    ).dataset;
  },
  RTSTRUCT: (options) => {
    const studyData = { StudyInstanceUID: '1', PatientID: 'P1' };
    const studyProvider = (type) =>
      type === Enums.MetadataModules.STUDY_DATA ? studyData : undefined;
    metaData.addProvider(studyProvider, 100000);
    try {
      // One contour annotation without segment data: the writer builds the
      // instance from its image and skips its contour.
      const contour = {
        metadata: { referencedImageId: 'rtss:exemplar' },
        data: {},
      };
      mockGetAnnotation.mockReturnValue(contour);
      return generateRTSSFromRepresentation(
        {
          label: 'Contours',
          segments: {},
          representationData: {
            Contour: { annotationUIDsMap: new Map([[1, new Set(['uid'])]]) },
          },
        },
        options
      );
    } finally {
      metaData.removeProvider(studyProvider);
    }
  },
};

const DEFAULTS = {
  Manufacturer: 'CornerstoneJS',
  ManufacturerModelName: '@cornerstonejs/adapters',
  SoftwareVersions: version,
};

const GIVEN = {
  Manufacturer: 'OHIF',
  ManufacturerModelName: 'dcmjs',
  SoftwareVersions: ['OHIF 3.14.0', 'CS3D 5.13.2'],
};

describe('writer header', () => {
  const cases = Object.keys(writers).flatMap((writer) => [
    [writer, 'no writer options', {}, DEFAULTS],
    [writer, 'writer options', GIVEN, GIVEN],
  ]);

  it.each(cases)(
    '%s writes the header values for %s',
    (writer, _name, options, expected) => {
      const callerOptions = { ...options };
      const dataset = writers[writer](callerOptions);

      expect(dataset).toMatchObject(expected);
      expect(callerOptions).toEqual(options);
    }
  );
});
