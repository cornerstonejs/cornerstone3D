import {
  getDimensionGroupReferenceContext,
  isViewReferenceViewable,
} from '../src/RenderingEngine/Viewports/viewReferenceCompatibility';
import { displaySetRegistry } from '@cornerstonejs/metadata';

describe('BaseViewport reference compatibility', () => {
  const baseContext = {
    frameOfReferenceUID: 'for-1',
    displaySetId: 'data-1',
    imageIds: ['scheme:image-1', 'scheme:image-2', 'scheme:image-3'],
    currentImageIdIndex: 1,
    cameraFocalPoint: [0, 0, 5],
    viewPlaneNormal: [0, 0, 1],
  };

  it('matches frame-of-reference-only references', () => {
    expect(
      isViewReferenceViewable({ FrameOfReferenceUID: 'for-1' }, [baseContext])
    ).toBe(true);

    expect(
      isViewReferenceViewable({ FrameOfReferenceUID: 'for-2' }, [baseContext])
    ).toBe(false);
  });

  it('rejects mismatched data ids unless the reference is FOR-only', () => {
    expect(
      isViewReferenceViewable(
        { FrameOfReferenceUID: 'for-1', displaySetId: 'data-2' },
        [baseContext]
      )
    ).toBe(false);

    expect(
      isViewReferenceViewable(
        { FrameOfReferenceUID: 'for-1', displaySetId: 'data-1' },
        [baseContext]
      )
    ).toBe(true);
  });

  it('takes a reference of another display set of the same images by an image of the context', () => {
    const otherData = {
      FrameOfReferenceUID: 'for-1',
      displaySetId: 'data-2',
      volumeId: 'volume-2',
      sliceIndex: 0,
      viewPlaneNormal: [0, 0, -1],
    };

    displaySetRegistry.add('data-2', {
      imageIds: [...baseContext.imageIds].reverse(),
      volumeId: 'volume-2',
    });

    expect(
      isViewReferenceViewable(
        {
          ...otherData,
          displaySetId: 'data-unknown',
          referencedImageId: 'scheme:image-2',
        },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(false);
    expect(
      isViewReferenceViewable(
        { ...otherData, referencedImageId: 'scheme:image-2' },
        [baseContext]
      )
    ).toBe(true);
    expect(
      isViewReferenceViewable(
        { ...otherData, referencedImageId: 'scheme:image-3' },
        [baseContext]
      )
    ).toBe(false);
    expect(
      isViewReferenceViewable(
        { ...otherData, referencedImageId: 'scheme:image-3' },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(true);
    expect(
      isViewReferenceViewable(
        { ...otherData, referencedImageId: 'scheme:image-9' },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(false);
    expect(
      isViewReferenceViewable(
        {
          ...otherData,
          referencedImageId: 'scheme:image-3',
          viewPlaneNormal: [1, 0, 0],
        },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(false);

    displaySetRegistry.remove('data-2');
  });

  it('shows a reference to an image URI of the whole data on every slice', () => {
    const context = { ...baseContext, imageURIs: ['whole-data'] };

    for (const currentImageIdIndex of [0, 1, 2]) {
      expect(
        isViewReferenceViewable({ referencedImageURI: 'whole-data' }, [
          { ...context, currentImageIdIndex },
        ])
      ).toBe(true);
    }

    expect(
      isViewReferenceViewable({ referencedImageURI: 'image-3' }, [context])
    ).toBe(false);
    expect(
      isViewReferenceViewable({ referencedImageURI: 'other-data' }, [context])
    ).toBe(false);
    expect(
      isViewReferenceViewable({ referencedImageURI: 'whole-data' }, [
        baseContext,
      ])
    ).toBe(false);
  });

  it('matches image references by current image or navigable image', () => {
    expect(
      isViewReferenceViewable({ referencedImageId: 'scheme:image-2' }, [
        baseContext,
      ])
    ).toBe(true);

    expect(
      isViewReferenceViewable({ referencedImageURI: 'image-3' }, [baseContext])
    ).toBe(false);

    expect(
      isViewReferenceViewable(
        { referencedImageURI: 'image-3' },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(true);
  });

  it('matches referenced image ranges against the current image', () => {
    expect(
      isViewReferenceViewable(
        {
          referencedImageId: 'scheme:image-1',
          multiSliceReference: {
            referencedImageId: 'scheme:image-3',
          },
        },
        [baseContext]
      )
    ).toBe(true);
  });

  it('can match any image reference for single-view URI membership contexts', () => {
    expect(
      isViewReferenceViewable({ referencedImageURI: 'tile-2' }, [
        {
          frameOfReferenceUID: 'for-1',
          imageURIs: ['tile-1', 'tile-2'],
          allowAnyImageReference: true,
        },
      ])
    ).toBe(true);
  });

  it('matches plane restrictions using orientation and navigation options', () => {
    expect(
      isViewReferenceViewable(
        {
          planeRestriction: {
            FrameOfReferenceUID: 'for-1',
            point: [0, 0, 5],
            inPlaneVector1: [1, 0, 0],
            inPlaneVector2: [0, 1, 0],
          },
        },
        [baseContext]
      )
    ).toBe(true);

    expect(
      isViewReferenceViewable(
        {
          planeRestriction: {
            FrameOfReferenceUID: 'for-1',
            point: [0, 0, 6],
            inPlaneVector1: [1, 0, 0],
            inPlaneVector2: [0, 1, 0],
          },
        },
        [baseContext]
      )
    ).toBe(false);

    expect(
      isViewReferenceViewable(
        {
          planeRestriction: {
            FrameOfReferenceUID: 'for-1',
            point: [0, 0, 6],
            inPlaneVector1: [1, 0, 0],
            inPlaneVector2: [0, 1, 0],
          },
        },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(true);
  });

  it('matches 1-based dimension group restrictions', () => {
    const context = {
      ...baseContext,
      dimensionGroupNumber: 2,
      numDimensionGroups: 4,
    };

    expect(
      isViewReferenceViewable({ dimensionGroupNumber: 2 }, [context])
    ).toBe(true);

    expect(
      isViewReferenceViewable({ dimensionGroupNumber: 3 }, [context])
    ).toBe(false);

    expect(
      isViewReferenceViewable({ dimensionGroupNumber: 3 }, [context], {
        withNavigation: true,
      })
    ).toBe(true);

    expect(
      isViewReferenceViewable({ dimensionGroupNumber: 5 }, [context], {
        withNavigation: true,
      })
    ).toBe(false);

    expect(
      isViewReferenceViewable({ dimensionGroupNumber: 0 }, [context], {
        withNavigation: true,
      })
    ).toBe(false);
  });

  it('takes a time point on a context without time points, as a static volume or a stack', () => {
    const viewRef = {
      FrameOfReferenceUID: 'for-1',
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: [0, 0, 5],
      dimensionGroupNumber: 2,
    };

    expect(getDimensionGroupReferenceContext({})).toEqual({
      dimensionGroupNumber: undefined,
      numDimensionGroups: undefined,
    });
    expect(isViewReferenceViewable(viewRef, [baseContext])).toBe(true);
    expect(
      isViewReferenceViewable(viewRef, [baseContext], {
        withNavigation: true,
      })
    ).toBe(true);
  });

  it('extracts dimension group context from dynamic volumes', () => {
    expect(
      getDimensionGroupReferenceContext({
        dimensionGroupNumber: 2,
        numDimensionGroups: 4,
      })
    ).toEqual({
      dimensionGroupNumber: 2,
      numDimensionGroups: 4,
    });
  });

  it('reads a dynamic volume of one time point as a static volume, as 5.19.4', () => {
    const oneTimePoint = {
      dimensionGroupNumber: 1,
      numDimensionGroups: 1,
      isDynamicVolume: () => false,
    };
    const viewRef = {
      FrameOfReferenceUID: 'for-1',
      viewPlaneNormal: [0, 0, 1],
      cameraFocalPoint: [0, 0, 5],
      dimensionGroupNumber: 2,
    };

    expect(getDimensionGroupReferenceContext(oneTimePoint)).toEqual({
      dimensionGroupNumber: undefined,
      numDimensionGroups: undefined,
    });
    expect(
      isViewReferenceViewable(viewRef, [
        { ...baseContext, ...getDimensionGroupReferenceContext(oneTimePoint) },
      ])
    ).toBe(true);
    expect(
      getDimensionGroupReferenceContext({
        dimensionGroupNumber: 2,
        numDimensionGroups: 4,
        isDynamicVolume: () => true,
      })
    ).toEqual({
      dimensionGroupNumber: 2,
      numDimensionGroups: 4,
    });
  });
});
