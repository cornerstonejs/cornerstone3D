import { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { setAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import type { ContourSegmentationAnnotation, Segmentation } from '../../types';

jest.mock('../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

jest.mock('../../stateManagement/annotation/annotationLocking', () => ({
  setAnnotationLocked: jest.fn(),
}));

/** A contour annotation of a segment of the segmentation `contours`. */
function makeAnnotation(
  annotationUID: string,
  segmentIndex: number
): ContourSegmentationAnnotation {
  return {
    annotationUID,
    data: { segmentation: { segmentationId: 'contours', segmentIndex } },
  } as unknown as ContourSegmentationAnnotation;
}

/** A contour segmentation with the segments given, and no contour yet. */
function useSegmentation(segments: Segmentation['segments']): Segmentation {
  const segmentation = {
    segmentationId: 'contours',
    segments,
    representationData: {},
  } as unknown as Segmentation;

  (getSegmentation as jest.Mock).mockReturnValue(segmentation);

  return segmentation;
}

describe('addContourSegmentationAnnotation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds the contour of a segment that has no entry in the segments of the segmentation', () => {
    const segmentation = useSegmentation({});

    expect(() =>
      addContourSegmentationAnnotation(makeAnnotation('contour-1', 1))
    ).not.toThrow();

    expect(
      Array.from(
        segmentation.representationData.Contour.annotationUIDsMap.get(1)
      )
    ).toEqual(['contour-1']);
    expect(setAnnotationLocked).not.toHaveBeenCalled();
  });

  it('locks the contour of a locked segment', () => {
    useSegmentation({
      2: { segmentIndex: 2, locked: true } as Segmentation['segments'][number],
    });

    addContourSegmentationAnnotation(makeAnnotation('contour-2', 2));

    expect(setAnnotationLocked).toHaveBeenCalledWith('contour-2', true);
  });
});
