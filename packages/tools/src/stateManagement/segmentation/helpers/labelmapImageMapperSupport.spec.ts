jest.mock('@cornerstonejs/core', () => {
  return {
    Enums: {
      BlendModes: {
        COMPOSITE: 0,
        MAXIMUM_INTENSITY_BLEND: 1,
        AVERAGE_INTENSITY_BLEND: 2,
        LABELMAP_EDGE_PROJECTION_BLEND: 3,
      },
      ViewportType: {
        PLANAR: 'planar',
      },
    },
    utilities: jest.requireActual(
      '../../../../../core/src/utilities/viewportCapabilities'
    ),
  };
});

jest.mock('../labelmapModel/labelmapLayerStore', () => ({
  getLabelmaps: jest.fn(),
}));

import {
  canRenderVolumeViewportLabelmapAsImage,
  getVolumeViewportLabelmapImageMapperState,
  isPlanarCpuSliceViewport,
  isSliceRenderingEnabled,
  shouldUseSliceRendering,
  LABELMAP_IMAGE_MAPPER_URL_PARAM,
} from './labelmapImageMapperSupport';

const { getLabelmaps } = jest.requireMock(
  '../labelmapModel/labelmapLayerStore'
);

const { Enums } = jest.requireMock('@cornerstonejs/core');

/** The render plan layer of a source cut on the GPU from its 3D texture. */
const GPU_VOLUME_SLICE = { slice: 'gpuVolume', draw: 'gpu' };

/** The render plan layer of a source cut on the CPU and drawn on the GPU. */
const CPU_SLICE_ON_GPU = { slice: 'cpu', draw: 'gpu' };

/** The render plan layer of a source cut on the CPU and drawn on the CPU. */
const CPU_SLICE_ON_CPU = { slice: 'cpu', draw: 'cpu' };

function makePlanarViewport(opts: {
  layer?: { slice: string; draw: string };
  blendMode?: number;
  slabThickness?: number;
  sliceIndex?: number;
  resolvedCamera?: { viewPlaneNormal: number[]; viewUp: number[] };
}) {
  const layer = opts.layer ?? GPU_VOLUME_SLICE;
  return {
    type: 'planar',
    getSourceDisplaySetId: () => 'src',
    getRenderPlan: () => [
      {
        displaySetId: 'src',
        role: 'source',
        backend: layer.draw,
        reason: 'slice',
        ...layer,
      },
    ],
    getAppearance: () => ({
      blendMode: opts.blendMode,
      slabThickness: opts.slabThickness,
    }),
    getDisplaySetAppearance: () => ({
      blendMode: opts.blendMode,
      slabThickness: opts.slabThickness,
    }),
    getDefaultActor: () => ({
      displaySetId: 'src',
      actor: {
        getMapper: () =>
          layer === CPU_SLICE_ON_GPU
            ? {}
            : {
                getBlendMode: () => opts.blendMode,
                getSlabThickness: () => opts.slabThickness,
              },
      },
    }),
    getCurrentImageIdIndex: () => opts.sliceIndex ?? 0,
    getResolvedView: () =>
      opts.resolvedCamera
        ? { toICamera: () => opts.resolvedCamera }
        : undefined,
  };
}

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

describe('isSliceRenderingEnabled', () => {
  beforeEach(() => {
    setSearch('');
  });

  afterAll(() => {
    setSearch('');
  });

  it('honors an explicit options.useSliceRendering=true', () => {
    expect(isSliceRenderingEnabled({ useSliceRendering: true })).toBe(true);
  });

  it('returns false when the URL param is absent', () => {
    expect(isSliceRenderingEnabled()).toBe(false);
  });

  it('returns true when the URL param is present with no value', () => {
    setSearch(`?${LABELMAP_IMAGE_MAPPER_URL_PARAM}`);
    expect(isSliceRenderingEnabled()).toBe(true);
  });

  it('returns true for truthy values', () => {
    setSearch(`?${LABELMAP_IMAGE_MAPPER_URL_PARAM}=1`);
    expect(isSliceRenderingEnabled()).toBe(true);

    setSearch(`?${LABELMAP_IMAGE_MAPPER_URL_PARAM}=true`);
    expect(isSliceRenderingEnabled()).toBe(true);
  });

  it('returns false for falsy values', () => {
    for (const value of ['0', 'false', 'off', 'FALSE']) {
      setSearch(`?${LABELMAP_IMAGE_MAPPER_URL_PARAM}=${value}`);
      expect(isSliceRenderingEnabled()).toBe(false);
    }
  });
});

describe('shouldUseSliceRendering', () => {
  beforeEach(() => {
    setSearch('');
    getLabelmaps.mockReset();
  });

  it('returns true when the URL flag is set regardless of segmentation', () => {
    expect(
      shouldUseSliceRendering(undefined, { useSliceRendering: true })
    ).toBe(true);
  });

  it('returns false when there is no Labelmap representation', () => {
    expect(shouldUseSliceRendering({ representationData: {} } as never)).toBe(
      false
    );
  });

  it('returns true when there are multiple layers and at least one is a stack', () => {
    getLabelmaps.mockReturnValue([
      { storageKind: 'volume' },
      { storageKind: 'stack' },
    ]);
    expect(
      shouldUseSliceRendering({
        representationData: { Labelmap: {} },
      } as never)
    ).toBe(true);
  });

  it('returns true on a viewport that samples its slice on the CPU, with no flag', () => {
    const viewport = makePlanarViewport({
      layer: CPU_SLICE_ON_GPU,
    });

    expect(
      shouldUseSliceRendering(
        { representationData: {} } as never,
        undefined,
        viewport as never
      )
    ).toBe(true);
  });

  it('keeps the flag on a viewport that samples a slab on the CPU, as on the GPU volume path', () => {
    for (const layer of [CPU_SLICE_ON_GPU, GPU_VOLUME_SLICE]) {
      const viewport = makePlanarViewport({
        layer,
        slabThickness: 10,
      });

      expect(
        shouldUseSliceRendering(
          { representationData: {} } as never,
          undefined,
          viewport as never
        )
      ).toBe(false);
      expect(
        shouldUseSliceRendering(
          { representationData: {} } as never,
          { useSliceRendering: true },
          viewport as never
        )
      ).toBe(true);
    }
  });

  it('keeps the flag on a viewport on the GPU volume slice path', () => {
    const viewport = makePlanarViewport({
      layer: GPU_VOLUME_SLICE,
    });

    expect(
      shouldUseSliceRendering(
        { representationData: {} } as never,
        undefined,
        viewport as never
      )
    ).toBe(false);
  });

  it('returns false when only one labelmap layer exists', () => {
    getLabelmaps.mockReturnValue([{ storageKind: 'stack' }]);
    expect(
      shouldUseSliceRendering({
        representationData: { Labelmap: {} },
      } as never)
    ).toBe(false);
  });
});

describe('canRenderVolumeViewportLabelmapAsImage', () => {
  it('rejects viewports that are not planar-next', () => {
    expect(
      canRenderVolumeViewportLabelmapAsImage({ type: 'volume3d' } as never)
    ).toBe(false);
  });

  it('rejects when slab thickness exceeds the supported minimum', () => {
    const viewport = makePlanarViewport({
      blendMode: Enums.BlendModes.COMPOSITE,
      slabThickness: 5,
    });
    expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
      false
    );
  });

  it('accepts a planar-next viewport whose source is a GPU volume slice with thin slab', () => {
    const viewport = makePlanarViewport({
      layer: GPU_VOLUME_SLICE,
      slabThickness: 0.1,
    });
    expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
      true
    );
  });

  it('accepts a planar-next viewport that samples its slice on the CPU, with no slab', () => {
    for (const slabThickness of [undefined, 0, 0.1]) {
      const viewport = makePlanarViewport({
        layer: CPU_SLICE_ON_GPU,
        slabThickness,
      });

      expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
        true
      );
    }
  });

  it('rejects a slab on a sampled slice as it does on the GPU volume slice path', () => {
    for (const layer of [CPU_SLICE_ON_GPU, GPU_VOLUME_SLICE]) {
      const viewport = makePlanarViewport({
        layer,
        slabThickness: 10,
      });

      expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
        false
      );
    }
  });

  it('treats a planar viewport in volume mode as a planar viewport, also with a legacy getBlendMode', () => {
    const getBlendMode = jest.fn(
      () => Enums.BlendModes.MAXIMUM_INTENSITY_BLEND
    );
    const viewport = {
      ...makePlanarViewport({ layer: GPU_VOLUME_SLICE }),
      setDisplaySets: jest.fn(),
      setDisplaySetAppearance: jest.fn(),
      setViewState: jest.fn(),
      getCurrentMode: () => 'volume',
      getBlendMode,
    };

    expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
      true
    );
    expect(getBlendMode).not.toHaveBeenCalled();
  });

  it('rejects a planar-next viewport whose source is drawn on the CPU', () => {
    const viewport = makePlanarViewport({ layer: CPU_SLICE_ON_CPU });
    expect(canRenderVolumeViewportLabelmapAsImage(viewport as never)).toBe(
      false
    );
  });
});

describe('getVolumeViewportLabelmapImageMapperState', () => {
  it('returns unsupported:viewport for non-volume non-planar viewports', () => {
    const state = getVolumeViewportLabelmapImageMapperState({
      type: 'video',
    } as never);
    expect(state.supported).toBe(false);
    expect(state.key).toBe('unsupported:viewport');
    expect(Number.isNaN(state.sliceIndex)).toBe(true);
  });

  it('returns unsupported:camera when no camera is available', () => {
    const viewport = makePlanarViewport({ slabThickness: 0.1 });
    const state = getVolumeViewportLabelmapImageMapperState(viewport as never);
    expect(state.supported).toBe(false);
    expect(state.key).toBe('unsupported:camera');
  });

  it('keeps the planar key when the view turns in its own plane', () => {
    const keyFor = (viewUp: number[]) =>
      getVolumeViewportLabelmapImageMapperState(
        makePlanarViewport({
          slabThickness: 0.1,
          resolvedCamera: { viewPlaneNormal: [0, 0, 1], viewUp },
        }) as never
      );
    const aligned = keyFor([0, 1, 0]);

    expect(aligned.supported).toBe(true);
    expect(keyFor([0.5, 0.866, 0]).key).toBe(aligned.key);
  });

  it('supports a planar-next viewport that samples its slice on the CPU', () => {
    const state = getVolumeViewportLabelmapImageMapperState(
      makePlanarViewport({
        layer: CPU_SLICE_ON_GPU,
        slabThickness: 0.1,
        sliceIndex: 12,
        resolvedCamera: {
          viewPlaneNormal: [0, 0.6, 0.8],
          viewUp: [0, 0.8, -0.6],
        },
      }) as never
    );

    expect(state.supported).toBe(true);
    expect(state.sliceIndex).toBe(12);
    expect(state.key.endsWith(':12')).toBe(true);
  });

  it('marks a slab on a sampled slice as unsupported', () => {
    const state = getVolumeViewportLabelmapImageMapperState(
      makePlanarViewport({
        layer: CPU_SLICE_ON_GPU,
        slabThickness: 10,
        resolvedCamera: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
      }) as never
    );

    expect(state.supported).toBe(false);
    expect(state.key.startsWith('unsupported:slab:10.000:')).toBe(true);
  });

  it('marks unsupported slab thickness with a distinct key', () => {
    const viewport = makePlanarViewport({
      blendMode: Enums.BlendModes.COMPOSITE,
      slabThickness: 10,
      resolvedCamera: { viewPlaneNormal: [0, 0, 1], viewUp: [0, 1, 0] },
    });
    const state = getVolumeViewportLabelmapImageMapperState(viewport as never);
    expect(state.supported).toBe(false);
    expect(state.key.startsWith('unsupported:slab:')).toBe(true);
  });

  it('encodes the slice index of a supported planar-next viewport', () => {
    const viewport = makePlanarViewport({
      blendMode: Enums.BlendModes.AVERAGE_INTENSITY_BLEND,
      slabThickness: 0.1,
      sliceIndex: 7,
      resolvedCamera: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 1, 0] },
    });
    const state = getVolumeViewportLabelmapImageMapperState(viewport as never);
    expect(state.supported).toBe(true);
    expect(state.sliceIndex).toBe(7);
  });
});

describe('isPlanarCpuSliceViewport', () => {
  it('is true only for a planar-next viewport whose source is cut on the CPU and drawn on the GPU', () => {
    expect(
      isPlanarCpuSliceViewport(
        makePlanarViewport({ layer: CPU_SLICE_ON_GPU }) as never
      )
    ).toBe(true);
    expect(
      isPlanarCpuSliceViewport(
        makePlanarViewport({ layer: GPU_VOLUME_SLICE }) as never
      )
    ).toBe(false);
    expect(
      isPlanarCpuSliceViewport({
        ...makePlanarViewport({ layer: CPU_SLICE_ON_GPU }),
        type: 'volume3d',
      } as never)
    ).toBe(false);
  });
});
