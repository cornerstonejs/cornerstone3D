jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    BlendModes: {
      COMPOSITE: 0,
    },
    ViewportType: {
      PLANAR: 'planar',
    },
  },
}));

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    canRenderVolumeViewportLabelmapAsImage: jest.fn(),
  })
);

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapSegmentationState',
  () => ({
    getLabelmap: jest.fn(),
    getOrCreateLabelmapVolume: jest.fn(),
    getLabelmaps: jest.fn(),
    getLabelmapForImageId: jest.fn(),
    getLabelmapForVolumeId: jest.fn(),
  })
);

jest.mock('./volumeLabelmapSliceData', () => ({
  applyPlanarOverlayDepthOffset: jest.fn(),
  createSliceImageData: jest.fn(),
  getSliceRenderingCamera: jest.fn(),
  getSliceState: jest.fn(),
}));

jest.mock('./volumeLabelmapResampledSliceData', () => ({
  canCreateResampledSliceImageData: jest.fn(),
  createPlanarSliceImageData: jest.fn(),
}));

import {
  addVolumeLabelmapImageMapperActors,
  getLabelmapForActorReference,
  getVolumeLabelmapImageMapperRepresentationUIDs,
  placeVolumeLabelmapImageMapperActors,
  updateVolumeLabelmapImageMapperActors,
} from './volumeLabelmapImageMapper';

const { canRenderVolumeViewportLabelmapAsImage } = jest.requireMock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport'
);
const {
  getLabelmap,
  getLabelmapForImageId,
  getLabelmapForVolumeId,
  getLabelmaps,
  getOrCreateLabelmapVolume,
} = jest.requireMock(
  '../../../stateManagement/segmentation/helpers/labelmapSegmentationState'
);
const {
  applyPlanarOverlayDepthOffset,
  createSliceImageData,
  getSliceRenderingCamera,
  getSliceState,
} = jest.requireMock('./volumeLabelmapSliceData');
const { canCreateResampledSliceImageData, createPlanarSliceImageData } =
  jest.requireMock('./volumeLabelmapResampledSliceData');

function makeSegmentation() {
  return {
    segmentationId: 'seg-1',
    representationData: { Labelmap: {} },
  } as never;
}

/** The render plan layer of each labelmap display set of a test. */
const labelmapLayers = new Map<string, { slice: string; draw: string }>();

afterEach(() => {
  labelmapLayers.clear();
});

function makePlanarViewport() {
  return {
    id: 'vp-planar',
    type: 'planar',
    addImages: jest.fn(async () => {}),
    getCurrentImageId: jest.fn(() => 'curr-image'),
    getActors: jest.fn(() => []),
    getRenderPlan: jest.fn(() =>
      [...labelmapLayers].map(([displaySetId, layer]) => ({
        displaySetId,
        role: 'overlay',
        ...layer,
      }))
    ),
    render: jest.fn(),
  };
}

/**
 * An actor entry of an image slice that the viewport draws under or over a
 * labelmap slice, such as the CT or the PT layer of a fusion view.
 */
function makeImageSliceEntry(uid: string) {
  return {
    uid,
    actor: {
      getClassName: () => 'vtkImageSlice',
      getMapper: jest.fn(),
      modified: jest.fn(),
    },
  };
}

/**
 * An actor entry of a labelmap slice image on a planar viewport.
 */
function makeLabelmapSliceEntry(args: {
  representationUID: string;
  referencedId: string;
  imageData?: unknown;
  slice?: string;
}) {
  const mapper = {
    setInputData: jest.fn(),
    modified: jest.fn(),
    getInputData: jest.fn(() => args.imageData),
  };

  labelmapLayers.set(args.representationUID, {
    slice: args.slice ?? 'frame',
    draw: 'gpu',
  });

  return {
    uid: args.representationUID,
    displaySetId: args.representationUID,
    representationUID: args.representationUID,
    referencedId: args.referencedId,
    actor: {
      getClassName: () => 'vtkImageSlice',
      getMapper: jest.fn(() => mapper),
      modified: jest.fn(),
    },
  };
}

describe('getVolumeLabelmapImageMapperRepresentationUIDs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns [] when the viewport cannot render as image mapper', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    expect(
      getVolumeLabelmapImageMapperRepresentationUIDs(
        makePlanarViewport() as never,
        'seg-1',
        makeSegmentation()
      )
    ).toEqual([]);
  });

  it('skips layers whose volume cannot be created', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    getLabelmaps.mockReturnValue([{ labelmapId: 'a' }, { labelmapId: 'b' }]);
    getOrCreateLabelmapVolume
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({
        imageIds: ['v-0'],
      });
    getSliceState.mockReturnValue({ key: 'slice-key' });

    const uids = getVolumeLabelmapImageMapperRepresentationUIDs(
      makePlanarViewport() as never,
      'seg-1',
      makeSegmentation()
    );
    expect(uids).toHaveLength(1);
    expect(uids[0]).toContain('seg-1');
    expect(uids[0]).toContain('b');
  });

  it('omits the slice key when the viewport is the planar slice-rendering kind', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v-0'] });
    getSliceState.mockReturnValue({ key: 'slice-key' });

    const uids = getVolumeLabelmapImageMapperRepresentationUIDs(
      makePlanarViewport() as never,
      'seg-1',
      makeSegmentation()
    );
    expect(uids).toHaveLength(1);
    expect(uids[0]).not.toContain('slice-key');
  });

  it('keeps the planar UID for an off-axis view whose slice can be resampled', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v-0'] });
    getSliceState.mockReturnValue(undefined);
    canCreateResampledSliceImageData.mockReturnValue(true);

    const uids = getVolumeLabelmapImageMapperRepresentationUIDs(
      makePlanarViewport() as never,
      'seg-1',
      makeSegmentation()
    );

    expect(uids).toHaveLength(1);
    expect(uids[0]).toContain('layer-1');
  });

  it('returns no planar UID when the off-axis view plane misses the volume', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v-0'] });
    getSliceState.mockReturnValue(undefined);
    canCreateResampledSliceImageData.mockReturnValue(false);

    expect(
      getVolumeLabelmapImageMapperRepresentationUIDs(
        makePlanarViewport() as never,
        'seg-1',
        makeSegmentation()
      )
    ).toEqual([]);
  });
});

describe('addVolumeLabelmapImageMapperActors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when the viewport cannot render as image mapper', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    const viewport = makePlanarViewport();

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(getLabelmaps).not.toHaveBeenCalled();
    expect(viewport.addImages).not.toHaveBeenCalled();
  });

  it('skips layers that fail to resolve a labelmap volume or slice data', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();
    getLabelmaps.mockReturnValue([
      { labelmapId: 'a' },
      { labelmapId: 'b' },
      { labelmapId: 'c' },
    ]);
    getOrCreateLabelmapVolume
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ imageIds: ['v-0'] })
      .mockReturnValueOnce({ imageIds: ['v-0'] });
    createPlanarSliceImageData
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({
        imageData: {},
        sliceIndex: 0,
      });

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(viewport.addImages).toHaveBeenCalledTimes(1);
  });

  it('routes through addImages on planar-next viewports', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({
      imageIds: ['v-0', 'v-1'],
    });
    createPlanarSliceImageData.mockReturnValue({
      imageData: {},
      sliceIndex: 0,
    });
    getSliceRenderingCamera.mockReturnValue({
      viewPlaneNormal: [0, 0, 1],
    });

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(viewport.addImages).toHaveBeenCalledTimes(1);
    expect(viewport.render).toHaveBeenCalled();
    const [stackInputs] = viewport.addImages.mock.calls[0];
    expect(stackInputs[0].reference).toMatchObject({
      kind: 'segmentation',
      segmentationId: 'seg-1',
      labelmapId: 'layer-1',
    });

    // Exercise the per-actor callback to ensure the depth-offset path is wired.
    const fakeImageActor = {
      getMapper: () => ({ setInputData: jest.fn(), modified: jest.fn() }),
    };
    stackInputs[0].callback({ imageActor: fakeImageActor });
    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalled();
  });

  it('asks the planar slice mapper for the label outline at the faces of the volume', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v-0'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: {},
      sliceIndex: 0,
    });
    getSliceRenderingCamera.mockReturnValue(undefined);

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
      outlineAtImageEdges: true,
    });

    const [stackInputs] = viewport.addImages.mock.calls[0];
    const mapper = {
      setInputData: jest.fn(),
      modified: jest.fn(),
      set: jest.fn(() => true),
    };

    stackInputs[0].callback({ imageActor: { getMapper: () => mapper } });

    expect(mapper.set).toHaveBeenCalledWith(
      { labelOutlineAtImageEdges: true },
      true
    );
    expect(mapper.modified).toHaveBeenCalledTimes(2);
  });

  it('places a new planar slice after the image slices that the viewport already draws', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();
    const camera = { focalPoint: [0, 0, 10], viewPlaneNormal: [0, 0, 1] };
    const sliceImageData = {};

    viewport.getActors = jest.fn(() => [
      makeImageSliceEntry('ct'),
      makeImageSliceEntry('pt'),
    ]) as never;
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v-0'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: sliceImageData,
      sliceIndex: 0,
    });
    getSliceRenderingCamera.mockReturnValue(camera);

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    const [stackInputs] = viewport.addImages.mock.calls[0];
    const newImageActor = {
      getClassName: () => 'vtkImageSlice',
      getMapper: () => ({ setInputData: jest.fn(), modified: jest.fn() }),
    };

    stackInputs[0].callback({ imageActor: newImageActor });

    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalledWith(
      newImageActor,
      sliceImageData,
      camera,
      4
    );
  });

  it('gives the planar slice image of an off-axis view to addImages', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();
    const resampledImageData = {};

    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({
      imageIds: ['v-0', 'v-1'],
    });
    createPlanarSliceImageData.mockReturnValue({
      imageData: resampledImageData,
      sliceIndex: 1,
    });

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    const [stackInputs] = viewport.addImages.mock.calls[0];

    expect(createSliceImageData).not.toHaveBeenCalled();
    expect(stackInputs[0].imageData).toBe(resampledImageData);
    expect(stackInputs[0].useWorldCoordinateImageData).toBe(true);
  });

  it('falls back to the image of the slice index when the planar viewport has no current image', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();

    viewport.getCurrentImageId = jest.fn(() => undefined);
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({
      imageIds: ['v-0', 'v-1'],
    });
    createPlanarSliceImageData.mockReturnValue({
      imageData: {},
      sliceIndex: 1,
    });

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    const [stackInputs] = viewport.addImages.mock.calls[0];

    expect(stackInputs[0].imageId).toBe('v-1');
  });

  it('adds no planar actor for a layer without a slice image', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarViewport();

    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({
      imageIds: ['v-0', 'v-1'],
    });
    createPlanarSliceImageData.mockReturnValue(undefined);

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(viewport.addImages).not.toHaveBeenCalled();
  });
});

describe('updateVolumeLabelmapImageMapperActors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when the viewport cannot render as image mapper', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    expect(() =>
      updateVolumeLabelmapImageMapperActors({
        viewport: makePlanarViewport() as never,
        segmentation: makeSegmentation(),
        segmentationId: 'seg-1',
      })
    ).not.toThrow();
  });

  it('updates only labelmap-tagged actor entries that match a layer', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const mapperA = { setInputData: jest.fn(), modified: jest.fn() };
    const actorA = {
      uid: 'seg-1-Labelmap-layer-a-slice1',
      representationUID: 'seg-1-Labelmap-layer-a-slice1',
      referencedId: 'layer-a',
      actor: {
        getMapper: jest.fn(() => mapperA),
        modified: jest.fn(),
      },
    };
    const actorOther = {
      uid: 'other-rep',
      representationUID: 'other-seg-Labelmap-x',
      referencedId: 'x',
      actor: { getMapper: jest.fn(), modified: jest.fn() },
    };

    getLabelmaps.mockReturnValue([
      { labelmapId: 'layer-a' },
      { labelmapId: 'missing-actor' },
    ]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: {},
      sliceIndex: 0,
    });

    const viewport = makePlanarViewport();
    viewport.getActors = jest.fn(() => [actorA, actorOther]) as never;

    updateVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(mapperA.setInputData).toHaveBeenCalled();
    expect(actorOther.actor.getMapper).not.toHaveBeenCalled();
  });

  it('gives planar actors the slice image of the planar slice data', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const mapper = { setInputData: jest.fn(), modified: jest.fn() };
    const actorEntry = {
      uid: 'seg-1-Labelmap-layer-a',
      representationUID: 'seg-1-Labelmap-layer-a',
      referencedId: 'layer-a',
      actor: {
        getMapper: jest.fn(() => mapper),
        modified: jest.fn(),
      },
    };
    const resampledImageData = {};

    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-a' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: resampledImageData,
      sliceIndex: 0,
    });

    const viewport = makePlanarViewport();
    viewport.getActors = jest.fn(() => [actorEntry]);

    updateVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(createSliceImageData).not.toHaveBeenCalled();
    expect(mapper.setInputData).toHaveBeenCalledWith(resampledImageData);
  });

  it('places a planar slice by its order among the image slices of the viewport', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const camera = { focalPoint: [0, 0, 10], viewPlaneNormal: [0, 0, 1] };
    const sliceImageData = {};
    const labelmapEntry = makeLabelmapSliceEntry({
      representationUID: 'seg-1-Labelmap-layer-a',
      referencedId: 'layer-a',
    });
    const contourEntry = {
      uid: 'contour',
      actor: { getClassName: () => 'vtkActor' },
    };

    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-a' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: sliceImageData,
      sliceIndex: 0,
    });
    getSliceRenderingCamera.mockReturnValue(camera);

    const viewport = makePlanarViewport();
    viewport.getActors = jest.fn(() => [
      makeImageSliceEntry('ct'),
      contourEntry,
      makeImageSliceEntry('pt'),
      labelmapEntry,
    ]) as never;

    updateVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalledTimes(1);
    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalledWith(
      labelmapEntry.actor,
      sliceImageData,
      camera,
      5
    );
  });

  it('places a planar slice in front of every image slice that the core numbers', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const camera = { focalPoint: [0, 0, 10], viewPlaneNormal: [0, 0, 1] };
    const labelmapEntry = makeLabelmapSliceEntry({
      representationUID: 'seg-1-Labelmap-layer-a',
      referencedId: 'layer-a',
    });
    const ct = makeImageSliceEntry('ct');
    const pt = makeImageSliceEntry('pt');
    const remountedCt = makeImageSliceEntry('ct-remounted');
    const largestCoreOrder = 1;

    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-a' }]);
    getOrCreateLabelmapVolume.mockReturnValue({ imageIds: ['v'] });
    createPlanarSliceImageData.mockReturnValue({
      imageData: {},
      sliceIndex: 0,
    });
    getSliceRenderingCamera.mockReturnValue(camera);

    const getLabelmapOrder = (rendererOrder: unknown[]) => {
      applyPlanarOverlayDepthOffset.mockClear();

      const viewport = makePlanarViewport();
      viewport.getActors = jest.fn(() => rendererOrder) as never;

      updateVolumeLabelmapImageMapperActors({
        viewport: viewport as never,
        segmentation: makeSegmentation(),
        segmentationId: 'seg-1',
      });

      return applyPlanarOverlayDepthOffset.mock.calls[0][3];
    };

    expect(getLabelmapOrder([ct, pt, labelmapEntry])).toBeGreaterThan(
      largestCoreOrder
    );
    expect(getLabelmapOrder([pt, labelmapEntry, remountedCt])).toBeGreaterThan(
      largestCoreOrder
    );
  });
});

describe('placeVolumeLabelmapImageMapperActors', () => {
  const camera = { focalPoint: [0, 0, 10], viewPlaneNormal: [0, 0, 1] };

  beforeEach(() => {
    jest.clearAllMocks();
    getSliceRenderingCamera.mockReturnValue(camera);
  });

  it('places each labelmap slice of the segmentation with the image that it holds', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const heldImageData = {};
    const labelmapEntry = makeLabelmapSliceEntry({
      representationUID: 'seg-1-Labelmap-layer-a',
      referencedId: 'layer-a',
      imageData: heldImageData,
    });
    const otherSegmentationEntry = makeLabelmapSliceEntry({
      representationUID: 'seg-2-Labelmap-layer-b',
      referencedId: 'layer-b',
      imageData: {},
    });
    const volumeLabelmapEntry = makeLabelmapSliceEntry({
      representationUID: 'seg-1-Labelmap-layer-c',
      referencedId: 'layer-c',
      imageData: {},
      slice: 'gpuVolume',
    });
    const viewport = makePlanarViewport();

    viewport.getActors = jest.fn(() => [
      makeImageSliceEntry('ct'),
      otherSegmentationEntry,
      volumeLabelmapEntry,
      labelmapEntry,
    ]) as never;

    placeVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentationId: 'seg-1',
    });

    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalledTimes(1);
    expect(applyPlanarOverlayDepthOffset).toHaveBeenCalledWith(
      labelmapEntry.actor,
      heldImageData,
      camera,
      7
    );
    expect(createPlanarSliceImageData).not.toHaveBeenCalled();
  });

  it('skips a labelmap slice that holds no image yet', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const viewport = makePlanarViewport();

    viewport.getActors = jest.fn(() => [
      makeLabelmapSliceEntry({
        representationUID: 'seg-1-Labelmap-layer-a',
        referencedId: 'layer-a',
      }),
    ]) as never;

    placeVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentationId: 'seg-1',
    });

    expect(applyPlanarOverlayDepthOffset).not.toHaveBeenCalled();
  });

  it('does nothing when the viewport cannot draw the labelmap as a slice image', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);

    const viewport = makePlanarViewport();

    placeVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentationId: 'seg-1',
    });

    expect(viewport.getActors).not.toHaveBeenCalled();
  });

  it('does nothing when the viewport has no camera', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    getSliceRenderingCamera.mockReturnValue(undefined);

    const viewport = makePlanarViewport();

    placeVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentationId: 'seg-1',
    });

    expect(viewport.getActors).not.toHaveBeenCalled();
  });
});

describe('getLabelmapForActorReference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined when no referencedId is provided', () => {
    expect(
      getLabelmapForActorReference(makeSegmentation(), undefined)
    ).toBeUndefined();
  });

  it('prefers direct labelmapId match before falling back to image or volume lookups', () => {
    getLabelmap.mockReturnValue({ labelmapId: 'direct' });
    getLabelmapForImageId.mockReturnValue({ labelmapId: 'via-image' });

    const result = getLabelmapForActorReference(makeSegmentation(), 'some-id');
    expect(result).toEqual({ labelmapId: 'direct' });
    expect(getLabelmapForImageId).not.toHaveBeenCalled();
  });

  it('falls back through image → volume → layers when direct lookup fails', () => {
    getLabelmap.mockReturnValue(undefined);
    getLabelmapForImageId.mockReturnValue(undefined);
    getLabelmapForVolumeId.mockReturnValue(undefined);
    getLabelmaps.mockReturnValue([
      { labelmapId: 'a', volumeId: 'vol-other' },
      { labelmapId: 'b', volumeId: 'vol-match' },
    ]);

    const result = getLabelmapForActorReference(
      makeSegmentation(),
      'vol-match'
    );
    expect(result).toEqual({ labelmapId: 'b', volumeId: 'vol-match' });
  });
});
