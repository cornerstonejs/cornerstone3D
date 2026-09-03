jest.mock('@cornerstonejs/core', () => ({
  ActorRenderMode: {
    VTK_IMAGE: 'VTK_IMAGE',
    VTK_VOLUME_SLICE: 'VTK_VOLUME_SLICE',
  },
  Enums: {
    BlendModes: {
      COMPOSITE: 0,
    },
    ViewportType: {
      ORTHOGRAPHIC: 'orthographic',
      PLANAR_NEXT: 'planarNext',
    },
  },
}));

jest.mock('@kitware/vtk.js/Rendering/Core/ImageMapper', () => ({
  __esModule: true,
  default: {
    newInstance: jest.fn(() => ({
      setInputData: jest.fn(),
      modified: jest.fn(),
    })),
  },
}));

jest.mock('@kitware/vtk.js/Rendering/Core/ImageSlice', () => ({
  __esModule: true,
  default: {
    newInstance: jest.fn(() => ({
      setMapper: jest.fn(),
      getMapper: jest.fn(() => ({
        setInputData: jest.fn(),
        modified: jest.fn(),
      })),
      modified: jest.fn(),
    })),
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

import {
  addVolumeLabelmapImageMapperActors,
  getLabelmapForActorReference,
  getVolumeLabelmapImageMapperRepresentationUIDs,
  removeVolumeLabelmapImageMapperActors,
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

function makeSegmentation() {
  return {
    segmentationId: 'seg-1',
    representationData: { Labelmap: {} },
  } as never;
}

function makeOrthographicViewport() {
  const overlayRenderer = {
    setLayer: jest.fn(),
    setPreserveDepthBuffer: jest.fn(),
    setActiveCamera: jest.fn(),
    setViewport: jest.fn(),
    addActor: jest.fn(),
    removeActor: jest.fn(),
    getActors: jest.fn(() => []),
  };
  // Simulates addRenderer registering the overlay so the second getRenderer
  // lookup returns it (matches the real offscreen render-window contract).
  let overlayAdded = false;
  const offscreen = {
    getRenderer: jest.fn(() => (overlayAdded ? overlayRenderer : undefined)),
    addRenderer: jest.fn(() => {
      overlayAdded = true;
    }),
    removeRenderer: jest.fn(),
    getRenderWindow: jest.fn(() => ({
      getNumberOfLayers: jest.fn(() => 1),
      setNumberOfLayers: jest.fn(),
    })),
  };
  return {
    id: 'vp-1',
    type: 'orthographic',
    getActors: jest.fn(() => []),
    addActor: jest.fn(),
    getRenderer: jest.fn(() => ({
      removeActor: jest.fn(),
      addActor: jest.fn(),
      getActiveCamera: jest.fn(),
      getViewport: jest.fn(() => [0, 0, 1, 1]),
    })),
    getRenderingEngine: jest.fn(() => ({
      getOffscreenMultiRenderWindow: jest.fn(() => offscreen),
    })),
    _overlayRenderer: overlayRenderer,
    _offscreen: offscreen,
  };
}

function makePlanarNextViewport() {
  return {
    id: 'vp-planar',
    type: 'planarNext',
    addImages: jest.fn(async () => {}),
    getCurrentImageId: jest.fn(() => 'curr-image'),
    getActors: jest.fn(() => []),
    render: jest.fn(),
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
        makeOrthographicViewport() as never,
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
      makeOrthographicViewport() as never,
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
      makePlanarNextViewport() as never,
      'seg-1',
      makeSegmentation()
    );
    expect(uids).toHaveLength(1);
    expect(uids[0]).not.toContain('slice-key');
  });
});

describe('addVolumeLabelmapImageMapperActors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when the viewport cannot render as image mapper', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    const viewport = makeOrthographicViewport();

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(getLabelmaps).not.toHaveBeenCalled();
    expect(viewport.addActor).not.toHaveBeenCalled();
  });

  it('skips layers that fail to resolve a labelmap volume or slice data', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makeOrthographicViewport();
    getLabelmaps.mockReturnValue([
      { labelmapId: 'a' },
      { labelmapId: 'b' },
      { labelmapId: 'c' },
    ]);
    getOrCreateLabelmapVolume
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ imageIds: ['v-0'] })
      .mockReturnValueOnce({ imageIds: ['v-0'] });
    createSliceImageData
      .mockReturnValueOnce(undefined) // layer b → skipped
      .mockReturnValueOnce({
        imageData: {},
        state: { key: 'slice-c' },
      });

    await addVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(viewport.addActor).toHaveBeenCalledTimes(1);
  });

  it('routes through addImages on planar-next viewports', async () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    const viewport = makePlanarNextViewport();
    getLabelmaps.mockReturnValue([{ labelmapId: 'layer-1' }]);
    getOrCreateLabelmapVolume.mockReturnValue({
      imageIds: ['v-0', 'v-1'],
    });
    createSliceImageData.mockReturnValue({
      imageData: {},
      state: { key: 'slice-key', sliceIndex: 0 },
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
});

describe('updateVolumeLabelmapImageMapperActors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when the viewport cannot render as image mapper', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    expect(() =>
      updateVolumeLabelmapImageMapperActors({
        viewport: makeOrthographicViewport() as never,
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
    createSliceImageData.mockReturnValue({
      imageData: {},
      state: { key: 'slice', sliceIndex: 0 },
    });

    const viewport = makeOrthographicViewport();
    viewport.getActors = jest.fn(() => [actorA, actorOther]);

    updateVolumeLabelmapImageMapperActors({
      viewport: viewport as never,
      segmentation: makeSegmentation(),
      segmentationId: 'seg-1',
    });

    expect(mapperA.setInputData).toHaveBeenCalled();
    expect(actorOther.actor.getMapper).not.toHaveBeenCalled();
  });
});

describe('removeVolumeLabelmapImageMapperActors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing for non-ORTHOGRAPHIC viewports', () => {
    const viewport = makePlanarNextViewport();
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);
    removeVolumeLabelmapImageMapperActors(viewport as never, 'seg-1');
    // Should not touch the rendering engine path
    expect(viewport.getActors).not.toHaveBeenCalled();
  });

  it('does nothing when canRender returns false', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(false);
    const viewport = makeOrthographicViewport();
    removeVolumeLabelmapImageMapperActors(viewport as never, 'seg-1');
    expect(viewport.getRenderingEngine).not.toHaveBeenCalled();
  });

  it('removes the overlay renderer when no labelmap actors remain', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const overlayRenderer = {
      removeActor: jest.fn(),
      getActors: jest.fn(() => []),
    };
    const offscreen = {
      getRenderer: jest.fn(() => overlayRenderer),
      removeRenderer: jest.fn(),
    };
    const viewport = makeOrthographicViewport();
    viewport.getRenderingEngine = jest.fn(() => ({
      getOffscreenMultiRenderWindow: jest.fn(() => offscreen),
    }));
    viewport.getActors = jest.fn(() => [
      {
        representationUID: 'seg-1-Labelmap-layer-a',
        referencedId: 'layer-a',
        actor: {},
      },
    ]);

    removeVolumeLabelmapImageMapperActors(viewport as never, 'seg-1');
    expect(overlayRenderer.removeActor).toHaveBeenCalledTimes(1);
    expect(offscreen.removeRenderer).toHaveBeenCalled();
  });

  it('preserves the overlay renderer when actors from other segmentations remain', () => {
    canRenderVolumeViewportLabelmapAsImage.mockReturnValue(true);

    const overlayRenderer = {
      removeActor: jest.fn(),
      getActors: jest.fn(() => [{ id: 'still-there' }]),
    };
    const offscreen = {
      getRenderer: jest.fn(() => overlayRenderer),
      removeRenderer: jest.fn(),
    };
    const viewport = makeOrthographicViewport();
    viewport.getRenderingEngine = jest.fn(() => ({
      getOffscreenMultiRenderWindow: jest.fn(() => offscreen),
    }));
    viewport.getActors = jest.fn(() => [
      {
        representationUID: 'seg-1-Labelmap-layer-a',
        referencedId: 'layer-a',
        actor: {},
      },
    ]);

    removeVolumeLabelmapImageMapperActors(viewport as never, 'seg-1');
    expect(overlayRenderer.removeActor).toHaveBeenCalled();
    expect(offscreen.removeRenderer).not.toHaveBeenCalled();
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
