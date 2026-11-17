jest.mock('../getSegmentation', () => ({ getSegmentation: jest.fn() }));
jest.mock('./extractSegmentPolylines', () => ({
  extractSegmentPolylines: jest.fn(),
}));
jest.mock('../../../utilities/contours', () => ({
  findContourHoles: jest.fn(),
}));
jest.mock('../../annotation/annotationState', () => ({
  getAnnotation: jest.fn(),
  clearParentAnnotation: jest.fn((annotation) => {
    annotation.parentAnnotationUID = undefined;
  }),
}));

import { getSegmentation } from '../getSegmentation';
import { extractSegmentPolylines } from './extractSegmentPolylines';
import { findContourHoles } from '../../../utilities/contours';
import {
  getAnnotation,
  clearParentAnnotation,
} from '../../annotation/annotationState';
import convertContourHoles from './convertContourHoles';

type TestAnnotation = {
  annotationUID: string;
  parentAnnotationUID?: string;
  childAnnotationUIDs?: string[];
  data: { segmentation: { segmentationId: string; segmentIndex: number } };
};

let annotations: Map<string, TestAnnotation>;
let segmentations: Map<
  string,
  {
    representationData: {
      Contour: { annotationUIDsMap: Map<number, Set<string>> };
    };
  }
>;

function addSegmentation(
  segmentationId: string,
  uidsBySegment: Record<number, string[]>
) {
  const annotationUIDsMap = new Map<number, Set<string>>();
  Object.entries(uidsBySegment).forEach(([segmentIndex, uids]) =>
    annotationUIDsMap.set(Number(segmentIndex), new Set(uids))
  );
  segmentations.set(segmentationId, {
    representationData: { Contour: { annotationUIDsMap } },
  });
  return annotationUIDsMap;
}

/**
 * Segment 1 of segmentation "seg" holds the contour "outer" with the hole
 * "hole". The hole is detected by findContourHoles as index 1 of the polylines.
 */
function setUpContourWithHole({ holeInSourceSet = false } = {}) {
  annotations.set('outer', {
    annotationUID: 'outer',
    childAnnotationUIDs: ['hole'],
    data: { segmentation: { segmentationId: 'seg', segmentIndex: 1 } },
  });
  annotations.set('hole', {
    annotationUID: 'hole',
    parentAnnotationUID: 'outer',
    data: { segmentation: { segmentationId: 'seg', segmentIndex: 1 } },
  });

  const sourceMap = addSegmentation('seg', {
    1: holeInSourceSet ? ['outer', 'hole'] : ['outer'],
  });

  (extractSegmentPolylines as jest.Mock).mockReturnValue(
    new Map([
      ['outer', [[0, 0]]],
      ['hole', [[1, 1]]],
    ])
  );
  (findContourHoles as jest.Mock).mockReturnValue([
    { contourIndex: 0, holeIndexes: [1] },
  ]);

  return sourceMap;
}

beforeEach(() => {
  jest.clearAllMocks();
  annotations = new Map();
  segmentations = new Map();
  (getAnnotation as jest.Mock).mockImplementation((uid) =>
    annotations.get(uid)
  );
  (getSegmentation as jest.Mock).mockImplementation((segmentationId) =>
    segmentations.get(segmentationId)
  );
});

describe('convertContourHoles', () => {
  it('moves a hole to the target segment of the same segmentation, so it takes that segment and its style', () => {
    const sourceMap = setUpContourWithHole();

    convertContourHoles('seg', 1, 'seg', 2);

    const hole = annotations.get('hole');
    expect(clearParentAnnotation).toHaveBeenCalledWith(hole);
    expect(hole.data.segmentation).toEqual({
      segmentationId: 'seg',
      segmentIndex: 2,
    });
    expect(Array.from(sourceMap.get(2))).toEqual(['hole']);
    expect(sourceMap.get(1).has('hole')).toBe(false);
    expect(annotations.get('outer').data.segmentation.segmentIndex).toBe(1);
  });

  it('moves a hole to a segment of another segmentation', () => {
    const sourceMap = setUpContourWithHole();
    const targetMap = addSegmentation('other', { 3: ['existing'] });

    convertContourHoles('seg', 1, 'other', 3);

    expect(annotations.get('hole').data.segmentation).toEqual({
      segmentationId: 'other',
      segmentIndex: 3,
    });
    expect(Array.from(targetMap.get(3))).toEqual(['existing', 'hole']);
    expect(sourceMap.get(1).has('hole')).toBe(false);
  });

  it('takes the hole out of the source segment when the source set already lists it', () => {
    const sourceMap = setUpContourWithHole({ holeInSourceSet: true });

    convertContourHoles('seg', 1, 'seg', 2);

    expect(Array.from(sourceMap.get(1))).toEqual(['outer']);
    expect(Array.from(sourceMap.get(2))).toEqual(['hole']);
  });

  it('without a target, keeps the hole in its own segment as a contour of its own', () => {
    const sourceMap = setUpContourWithHole();

    convertContourHoles('seg', 1);

    expect(clearParentAnnotation).toHaveBeenCalledWith(annotations.get('hole'));
    expect(annotations.get('hole').data.segmentation).toEqual({
      segmentationId: 'seg',
      segmentIndex: 1,
    });
    expect(Array.from(sourceMap.get(1)).sort()).toEqual(['hole', 'outer']);
  });
});
