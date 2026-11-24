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
    ).toBe(true);
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

  describe('the same display set as a stack and as a volume', () => {
    const volumeContext = {
      ...baseContext,
      displaySetId: 'series',
      volumeId: 'series-volume',
      imageIds: ['scheme:image-3', 'scheme:image-2', 'scheme:image-1'],
      currentImageIdIndex: 0,
    };
    const stackReference = {
      FrameOfReferenceUID: 'for-1',
      displaySetId: 'series',
      viewPlaneNormal: [0, 0, 1],
    };

    it('takes a stack reference of the image on display whatever its slice index in the stack', () => {
      expect(
        isViewReferenceViewable(
          {
            ...stackReference,
            referencedImageId: 'scheme:image-3',
            sliceIndex: 2,
          },
          [volumeContext]
        )
      ).toBe(true);
    });

    it('does not take a stack reference of another image whose slice index in the stack is the slice on display', () => {
      const otherImage = {
        ...stackReference,
        referencedImageId: 'scheme:image-1',
        sliceIndex: 0,
      };

      expect(isViewReferenceViewable(otherImage, [volumeContext])).toBe(false);
      expect(
        isViewReferenceViewable(otherImage, [volumeContext], {
          withNavigation: true,
        })
      ).toBe(true);
    });

    it('reads the slice index of a reference in the mode of the reference only', () => {
      expect(
        isViewReferenceViewable(
          {
            ...stackReference,
            volumeId: 'series-volume',
            referencedImageId: 'scheme:image-3',
            sliceIndex: 2,
          },
          [volumeContext]
        )
      ).toBe(false);
      expect(
        isViewReferenceViewable({ ...stackReference, sliceIndex: 2 }, [
          { ...baseContext, displaySetId: 'series' },
        ])
      ).toBe(false);
      expect(
        isViewReferenceViewable({ ...stackReference, sliceIndex: 1 }, [
          { ...baseContext, displaySetId: 'series' },
        ])
      ).toBe(true);
    });
  });

  describe('a reference of data that is no longer registered', () => {
    const volumeContext = {
      ...baseContext,
      volumeId: 'volume-1',
      volumeIds: ['volume-1'],
    };
    const plane = (point) => ({
      FrameOfReferenceUID: 'for-1',
      point,
      inPlaneVector1: [1, 0, 0],
      inPlaneVector2: [0, 1, 0],
    });

    it('takes a reference of a display set that is not registered by the image that it names', () => {
      const viewRef = {
        FrameOfReferenceUID: 'for-1',
        displaySetId: 'gone',
        referencedImageId: 'scheme:image-3',
        sliceIndex: 7,
        viewPlaneNormal: [0, 0, 1],
      };

      expect(isViewReferenceViewable(viewRef, [baseContext])).toBe(false);
      expect(
        isViewReferenceViewable(viewRef, [baseContext], {
          withNavigation: true,
        })
      ).toBe(true);
      expect(
        isViewReferenceViewable(
          { ...viewRef, referencedImageId: 'scheme:image-2' },
          [baseContext]
        )
      ).toBe(true);
      expect(
        isViewReferenceViewable(
          { ...viewRef, referencedImageId: 'scheme:image-9' },
          [baseContext],
          { withNavigation: true }
        )
      ).toBe(false);
    });

    it('takes a reference of a volume that is not in the cache by the image that it names', () => {
      const viewRef = {
        FrameOfReferenceUID: 'for-1',
        volumeId: 'volume-gone',
        referencedImageId: 'scheme:image-2',
        sliceIndex: 0,
      };

      expect(isViewReferenceViewable(viewRef, [baseContext])).toBe(true);
      expect(isViewReferenceViewable(viewRef, [volumeContext])).toBe(true);
    });

    it('takes a reference that names no image by its plane on a volume', () => {
      const viewRef = {
        FrameOfReferenceUID: 'for-1',
        displaySetId: 'gone',
        volumeId: 'volume-gone',
        sliceIndex: 40,
        viewPlaneNormal: [0, 0, 1],
        cameraFocalPoint: [0, 0, 5],
        planeRestriction: plane([0, 0, 5]),
      };
      const offSlice = {
        ...viewRef,
        cameraFocalPoint: [0, 0, 6],
        planeRestriction: plane([0, 0, 6]),
      };

      expect(isViewReferenceViewable(viewRef, [volumeContext])).toBe(true);
      expect(isViewReferenceViewable(offSlice, [volumeContext])).toBe(false);
      expect(
        isViewReferenceViewable({ ...offSlice, planeRestriction: undefined }, [
          volumeContext,
        ])
      ).toBe(false);
      expect(
        isViewReferenceViewable(offSlice, [volumeContext], {
          withNavigation: true,
        })
      ).toBe(true);
      expect(
        isViewReferenceViewable(
          {
            ...viewRef,
            viewPlaneNormal: [1, 0, 0],
            planeRestriction: undefined,
          },
          [volumeContext],
          { withNavigation: true }
        )
      ).toBe(false);
      expect(
        isViewReferenceViewable(
          {
            ...viewRef,
            viewPlaneNormal: [1, 0, 0],
            planeRestriction: undefined,
          },
          [volumeContext],
          { withNavigation: true, withOrientation: true }
        )
      ).toBe(true);
    });

    it('does not take a reference that names no image on a stack, nor one that names neither an image nor a plane', () => {
      expect(
        isViewReferenceViewable(
          {
            FrameOfReferenceUID: 'for-1',
            displaySetId: 'gone',
            volumeId: 'volume-gone',
            viewPlaneNormal: [0, 0, 1],
            planeRestriction: plane([0, 0, 5]),
          },
          [baseContext],
          { withNavigation: true }
        )
      ).toBe(false);
      expect(
        isViewReferenceViewable(
          { displaySetId: 'gone', volumeId: 'volume-gone' },
          [volumeContext],
          { withNavigation: true }
        )
      ).toBe(false);
    });
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
