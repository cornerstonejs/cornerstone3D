import { cache, Enums } from '@cornerstonejs/core';
import pickIntensityPointInSlab, {
  getSlabIntensityPickContext,
} from './pickIntensityPointInSlab';

const FAKE_VOLUME_ID = 'fakeVolume';

/**
 * 20x20x20 unit-spacing volume centered on the world origin (voxel centers at
 * integer world coordinates from -10 to 9 per axis). Intensities come from
 * the injected sampler so each test shapes its own data.
 */
function createFakeVolume(
  getValue: (i: number, j: number, k: number) => number
) {
  return {
    dimensions: [20, 20, 20],
    spacing: [1, 1, 1],
    origin: [-10, -10, -10],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    voxelManager: { getAtIJK: getValue },
  };
}

/**
 * Minimal axial Generic ("next") planar viewport: enough surface for the
 * isGenericViewport / viewportSupportsDisplaySetPresentation duck-typing,
 * plus a camera looking along +z with its focal plane at z = focalPoint[2].
 */
function createFakeMipViewport({
  volumeId = FAKE_VOLUME_ID as string | undefined,
  blendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND as unknown,
  slabThickness = 20 as number | undefined,
  mode = 'volume',
  focalPoint = [0, 0, 0],
} = {}) {
  const camera = {
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
    focalPoint: [...focalPoint],
    position: [focalPoint[0], focalPoint[1], focalPoint[2] + 100],
    parallelScale: 100,
  };

  return {
    id: 'mip',
    type: 'planarNext',
    setDisplaySets: async () => undefined,
    setDisplaySetPresentation: () => undefined,
    setViewState: () => undefined,
    getViewState: () => ({}),
    getCurrentMode: () => mode,
    getSourceDataId: () => 'fake-source-data',
    getDefaultVOIRange: () => undefined,
    getDisplaySetPresentation: () => ({ blendMode, slabThickness }),
    getVolumeId: () => volumeId,
    getViewReference: () => ({
      cameraFocalPoint: [...camera.focalPoint],
      viewPlaneNormal: [...camera.viewPlaneNormal],
      viewUp: [...camera.viewUp],
    }),
    getResolvedView: () => ({
      toICamera: () => ({
        viewPlaneNormal: [...camera.viewPlaneNormal],
        viewUp: [...camera.viewUp],
        focalPoint: [...camera.focalPoint],
        position: [...camera.position],
        parallelScale: camera.parallelScale,
      }),
    }),
    render: () => undefined,
  };
}

describe('pickIntensityPointInSlab', () => {
  function stubCachedVolume(volume: unknown) {
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation(((volumeId: string) =>
        volumeId === FAKE_VOLUME_ID ? volume : undefined) as never);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('picks the hottest voxel along the view normal within the slab', () => {
    // Hot voxel at world (0, 0, 4); the click lands on the central plane at
    // world (0, 0, 0).
    stubCachedVolume(
      createFakeVolume((i, j, k) =>
        i === 10 && j === 10 && k === 14 ? 100 : 0
      )
    );
    const viewport = createFakeMipViewport({ slabThickness: 20 });

    const picked = pickIntensityPointInSlab(viewport as never, [0, 0, 0]);

    expect(picked).not.toBeNull();
    expect(picked[0]).toBeCloseTo(0, 6);
    expect(picked[1]).toBeCloseTo(0, 6);
    expect(picked[2]).toBeCloseTo(4, 6);
  });

  it('never picks outside the slab', () => {
    // Same hot voxel at z = 4, but the slab only spans z in [-2, 2]: the
    // uniform in-slab data keeps the point on the central plane.
    stubCachedVolume(
      createFakeVolume((i, j, k) =>
        i === 10 && j === 10 && k === 14 ? 100 : 0
      )
    );
    const viewport = createFakeMipViewport({ slabThickness: 4 });

    const picked = pickIntensityPointInSlab(viewport as never, [0, 0, 0]);

    expect(picked).toEqual([0, 0, 0]);
  });

  it('prefers the sample closest to the central plane on uniform data', () => {
    stubCachedVolume(createFakeVolume(() => 7));
    const viewport = createFakeMipViewport({ slabThickness: 20 });

    expect(pickIntensityPointInSlab(viewport as never, [1, -2, 0])).toEqual([
      1, -2, 0,
    ]);
  });

  it('picks the dimmest voxel for minimum intensity projections', () => {
    stubCachedVolume(
      createFakeVolume((i, j, k) => (i === 10 && j === 10 && k === 14 ? 1 : 50))
    );
    const viewport = createFakeMipViewport({
      blendMode: Enums.BlendModes.MINIMUM_INTENSITY_BLEND,
      slabThickness: 20,
    });

    const picked = pickIntensityPointInSlab(viewport as never, [0, 0, 0]);

    expect(picked[2]).toBeCloseTo(4, 6);
  });

  it('does not apply to non-projection blend modes, missing slabs, stacks or missing volumes', () => {
    stubCachedVolume(createFakeVolume(() => 0));

    const composite = createFakeMipViewport({
      blendMode: Enums.BlendModes.COMPOSITE,
    });
    expect(getSlabIntensityPickContext(composite as never)).toBeNull();
    expect(pickIntensityPointInSlab(composite as never, [0, 0, 0])).toBeNull();

    const noSlab = createFakeMipViewport({ slabThickness: 0 });
    expect(pickIntensityPointInSlab(noSlab as never, [0, 0, 0])).toBeNull();

    const stack = createFakeMipViewport({ mode: 'stack' });
    expect(pickIntensityPointInSlab(stack as never, [0, 0, 0])).toBeNull();

    const noVolume = createFakeMipViewport({ volumeId: 'notInCache' });
    expect(pickIntensityPointInSlab(noVolume as never, [0, 0, 0])).toBeNull();
  });

  it('resolves the pick context for a MIP presentation', () => {
    const viewport = createFakeMipViewport({ slabThickness: 123 });

    expect(getSlabIntensityPickContext(viewport as never)).toEqual({
      mode: 'max',
      slabThicknessMm: 123,
    });
  });
});
