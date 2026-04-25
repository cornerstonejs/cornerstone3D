import {
  getDimensionGroupReferenceContext,
  isViewportNextReferenceViewable,
} from '../src/RenderingEngine/ViewportNext/viewportNextReferenceCompatibility';

describe('ViewportNext reference compatibility', () => {
  const baseContext = {
    frameOfReferenceUID: 'for-1',
    dataId: 'data-1',
    imageIds: ['scheme:image-1', 'scheme:image-2', 'scheme:image-3'],
    currentImageIdIndex: 1,
    cameraFocalPoint: [0, 0, 5],
    viewPlaneNormal: [0, 0, 1],
  };

  it('matches frame-of-reference-only references', () => {
    expect(
      isViewportNextReferenceViewable({ FrameOfReferenceUID: 'for-1' }, [
        baseContext,
      ])
    ).toBe(true);

    expect(
      isViewportNextReferenceViewable({ FrameOfReferenceUID: 'for-2' }, [
        baseContext,
      ])
    ).toBe(false);
  });

  it('rejects mismatched data ids unless the reference is FOR-only', () => {
    expect(
      isViewportNextReferenceViewable(
        { FrameOfReferenceUID: 'for-1', dataId: 'data-2' },
        [baseContext]
      )
    ).toBe(false);

    expect(
      isViewportNextReferenceViewable(
        { FrameOfReferenceUID: 'for-1', dataId: 'data-1' },
        [baseContext]
      )
    ).toBe(true);
  });

  it('matches image references by current image or navigable image', () => {
    expect(
      isViewportNextReferenceViewable({ referencedImageId: 'scheme:image-2' }, [
        baseContext,
      ])
    ).toBe(true);

    expect(
      isViewportNextReferenceViewable({ referencedImageURI: 'image-3' }, [
        baseContext,
      ])
    ).toBe(false);

    expect(
      isViewportNextReferenceViewable(
        { referencedImageURI: 'image-3' },
        [baseContext],
        { withNavigation: true }
      )
    ).toBe(true);
  });

  it('matches referenced image ranges against the current image', () => {
    expect(
      isViewportNextReferenceViewable(
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
      isViewportNextReferenceViewable({ referencedImageURI: 'tile-2' }, [
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
      isViewportNextReferenceViewable(
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
      isViewportNextReferenceViewable(
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
      isViewportNextReferenceViewable(
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
      isViewportNextReferenceViewable({ dimensionGroupNumber: 2 }, [context])
    ).toBe(true);

    expect(
      isViewportNextReferenceViewable({ dimensionGroupNumber: 3 }, [context])
    ).toBe(false);

    expect(
      isViewportNextReferenceViewable({ dimensionGroupNumber: 3 }, [context], {
        withNavigation: true,
      })
    ).toBe(true);

    expect(
      isViewportNextReferenceViewable({ dimensionGroupNumber: 5 }, [context], {
        withNavigation: true,
      })
    ).toBe(false);

    expect(
      isViewportNextReferenceViewable({ dimensionGroupNumber: 0 }, [context], {
        withNavigation: true,
      })
    ).toBe(false);
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
});
