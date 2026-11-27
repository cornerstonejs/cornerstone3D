import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// The labelmap to contour conversion runs in a web worker; stub it so the
// test controls which segments come back. Like the real function, it returns
// only the segments that have contours, each tagged with its segmentIndex.
const mockGenerateContourSets = jest.fn();
jest.mock('@cornerstonejs/tools', () => {
  const actual = jest.requireActual('@cornerstonejs/tools');
  return {
    ...actual,
    utilities: {
      ...actual.utilities,
      contours: {
        ...actual.utilities.contours,
        generateContourSetsFromLabelmap: (...args) =>
          mockGenerateContourSets(...args),
      },
    },
  };
});

const { metaData, Enums } = require('@cornerstonejs/core');
const {
  generateRTSSFromLabelmap,
} = require('../src/adapters/Cornerstone3D/RTStruct/RTSS');

const FRAME_OF_REFERENCE_UID = '1.2.3.4';
const IMAGE_ID = 'rtss:exemplar';

const SEGMENTS = {
  1: { segmentIndex: 1, label: 'Liver', color: [255, 0, 0, 255] },
  2: { segmentIndex: 2, label: 'Spleen', color: [0, 255, 0, 255] },
  3: { segmentIndex: 3, label: 'Kidney', color: [0, 0, 255, 255] },
};

function contourSetFor(segment) {
  return {
    segmentIndex: segment.segmentIndex,
    label: segment.label,
    color: segment.color,
    metadata: {
      FrameOfReferenceUID: FRAME_OF_REFERENCE_UID,
      referencedImageId: IMAGE_ID,
    },
    sliceContours: [
      {
        contours: [{ type: 'CLOSED_PLANAR', contourPoints: [0, 1, 2] }],
        polyData: {
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
          ],
        },
        referencedImageId: IMAGE_ID,
      },
    ],
  };
}

async function writeRtss(segments, paintedSegmentIndices) {
  mockGenerateContourSets.mockResolvedValue(
    paintedSegmentIndices.map((index) => contourSetFor(segments[index]))
  );
  const studyProvider = (type) => {
    if (type === Enums.MetadataModules.STUDY_DATA) {
      return { StudyInstanceUID: '1', PatientID: 'P1' };
    }
    if (type === Enums.MetadataModules.FRAME_MODULE) {
      return {
        sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
        sopInstanceUID: '1.2.3.5',
        frameNumber: 1,
        numberOfFrames: 1,
      };
    }
    if (type === Enums.MetadataModules.SOP_COMMON) {
      return {
        sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
        sopInstanceUID: '1.2.3.5',
      };
    }
    if (type === Enums.MetadataModules.GENERAL_SERIES) {
      return { seriesInstanceUID: '1.2.3.6' };
    }
  };
  metaData.addProvider(studyProvider, 100000);
  try {
    return await generateRTSSFromLabelmap(
      {
        label: 'Labelmap',
        segments,
        representationData: { Labelmap: { volumeId: 'seg' } },
      },
      {}
    );
  } finally {
    metaData.removeProvider(studyProvider);
  }
}

/** Returns, for each ROI, its name and the numbers that reference it. */
function roisOf(dataset) {
  return dataset.ROIContourSequence.map((roiContour, index) => {
    const number = roiContour.ReferencedROINumber;
    const structure = dataset.StructureSetROISequence.find(
      (it) => it.ROINumber === number
    );
    const observation = dataset.RTROIObservationsSequence.find(
      (it) => it.ReferencedROINumber === number
    );
    return {
      number,
      name: structure?.ROIName,
      color: roiContour.ROIDisplayColor,
      observed: !!observation,
      index,
    };
  });
}

describe('generateRTSSFromLabelmap ROI numbers', () => {
  beforeEach(() => mockGenerateContourSets.mockReset());

  it('numbers and names every ROI after its segment when all segments are painted', async () => {
    const dataset = await writeRtss(SEGMENTS, [1, 2, 3]);

    expect(roisOf(dataset)).toEqual([
      {
        number: 1,
        name: 'Liver',
        color: [255, 0, 0],
        observed: true,
        index: 0,
      },
      {
        number: 2,
        name: 'Spleen',
        color: [0, 255, 0],
        observed: true,
        index: 1,
      },
      {
        number: 3,
        name: 'Kidney',
        color: [0, 0, 255],
        observed: true,
        index: 2,
      },
    ]);
  });

  it('keeps the name and number of a segment that follows an empty segment', async () => {
    // Segment 1 has no voxels, so the contour conversion skips it.
    const dataset = await writeRtss(SEGMENTS, [2, 3]);

    expect(dataset.StructureSetROISequence.map((it) => it.ROIName)).toEqual([
      'Spleen',
      'Kidney',
    ]);
    expect(roisOf(dataset)).toEqual([
      {
        number: 2,
        name: 'Spleen',
        color: [0, 255, 0],
        observed: true,
        index: 0,
      },
      {
        number: 3,
        name: 'Kidney',
        color: [0, 0, 255],
        observed: true,
        index: 1,
      },
    ]);
  });

  it('writes segments whose indices do not start at 1', async () => {
    // Segment 1 was deleted, so the segmentation has only segments 2 and 3.
    const segments = { 2: SEGMENTS[2], 3: SEGMENTS[3] };
    const dataset = await writeRtss(segments, [2, 3]);

    expect(roisOf(dataset)).toEqual([
      {
        number: 2,
        name: 'Spleen',
        color: [0, 255, 0],
        observed: true,
        index: 0,
      },
      {
        number: 3,
        name: 'Kidney',
        color: [0, 0, 255],
        observed: true,
        index: 1,
      },
    ]);
  });
});
