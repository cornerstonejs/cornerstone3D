import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera';
import { BlendModes, MetadataModules, OrientationAxis } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import * as metaData from '../src/metaData';
import cache from '../src/cache/cache';
import ImageVolume from '../src/cache/classes/ImageVolume';
import volumeTextureStore from '../src/cache/volumeTextureStore';
import VoxelManager from '../src/utilities/VoxelManager';
import { setSliceFirst } from '../src/init';
import { getSlabSampleOffsets } from '../src/utilities/sampleVolumeSlice';
import {
  defaultVolumeStrategyProvider,
  selectFirstReadyStrategy,
} from '../src/RenderingEngine/helpers/volumeRenderStrategy';
import * as lifecycle from '../src/RenderingEngine/helpers/volumeStrategyLifecycle';
import {
  MAX_CPU_SLICE_SAMPLES,
  PlanarRenderPathDecisionService,
  canSampleSlabOnCpu,
  hasSlab,
} from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import { VtkVolumeSliceRenderPath } from '../src/RenderingEngine/Viewports/Planar/VtkVolumeSliceRenderPath';
import PlanarViewport, {
  getRemountedViewPropOrder,
} from '../src/RenderingEngine/Viewports/Planar/PlanarViewport';
import renderingEngineCache from '../src/RenderingEngine/renderingEngineCache';
import displaySetRegistry from '../src/RenderingEngine/Viewports/displaySetRegistry';

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

/**
 * A volume with the fields that the decision and the viewport read. The
 * voxels are not read.
 */
function createVolume({
  volumeId = 'ct-volume',
  dimensions = [8, 6, 10],
  spacing = [1, 1, 2],
  direction = [1, 0, 0, 0, 1, 0, 0, 0, 1],
  imageIds = Array.from({ length: dimensions[2] }, (_, i) => `ct:${i}`),
} = {}) {
  const origin = [0, 0, 0];
  const imageData = vtkImageData.newInstance({ spacing, origin, direction });

  imageData.setDimensions(dimensions);

  return {
    volumeId,
    imageIds,
    dimensions,
    spacing,
    direction,
    origin,
    dataType: 'Int16Array',
    voxelGrid: { dimensions, spacing, direction, origin },
    isDynamicVolume: () => false,
    imageData,
    metadata: { FrameOfReferenceUID: 'routing-frame' },
    loadStatus: { loaded: true, loading: false },
    load: jest.fn(),
    getVoxelQuality: jest.fn(() => undefined),
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => Int16Array,
      getRange: () => [-1000, 2000],
    },
  };
}

describe('slab routing of the slice first decision', () => {
  const dataSet = {
    imageIds: Array.from({ length: 135 }, (_, i) => `ct:${i}`),
    volumeId: 'ct-volume',
  };
  const ctSpacing = [0.98, 0.98, 3.27];
  const mip = {
    sliceFirst: true,
    slabThickness: 10,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  };
  let service;
  let volume;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    volume = createVolume({ dimensions: [512, 512, 135], spacing: ctSpacing });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === 'ct-volume' ? volume : undefined));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts the pixels of the view of the CPU volume path for a normal that follows a volume axis', () => {
    const ct = { dimensions: [512, 512, 135], spacing: ctSpacing };
    const count = getSlabSampleOffsets(ct, 10).length;

    expect(count * 512 * 135).toBeLessThanOrEqual(MAX_CPU_SLICE_SAMPLES);
    expect(count * 512 * 512).toBeGreaterThan(MAX_CPU_SLICE_SAMPLES);
    expect(canSampleSlabOnCpu(ct, 10)).toBe(false);
    expect(canSampleSlabOnCpu(volume, 10, [0, 1, 0])).toBe(true);
    expect(canSampleSlabOnCpu(volume, 10, [-1, 0, 0])).toBe(true);
    expect(canSampleSlabOnCpu(volume, 10, [0, 0, 1])).toBe(false);
    expect(
      canSampleSlabOnCpu(volume, 10, [0, Math.sin(0.3), Math.cos(0.3)])
    ).toBe(false);
    expect(canSampleSlabOnCpu(ct, 10, [0, 1, 0])).toBe(false);
  });

  const orientations = [
    OrientationAxis.AXIAL,
    OrientationAxis.CORONAL,
    OrientationAxis.SAGITTAL,
    OrientationAxis.ACQUISITION,
    {
      viewPlaneNormal: [0, -Math.cos(0.3), Math.sin(0.3)],
      viewUp: [0, Math.sin(0.3), Math.cos(0.3)],
    },
  ];
  const blendModes = [
    BlendModes.COMPOSITE,
    BlendModes.MAXIMUM_INTENSITY_BLEND,
    BlendModes.MINIMUM_INTENSITY_BLEND,
    BlendModes.AVERAGE_INTENSITY_BLEND,
  ];

  function modeOf(options) {
    return service.select(dataSet, options).renderMode;
  }

  it('draws a slab of any blend mode on the GPU volume path with slice first on', () => {
    blendModes.forEach((blendMode) => {
      [2, 10, 40, 300].forEach((slabThickness) => {
        orientations.forEach((orientation) => {
          expect(
            modeOf({ sliceFirst: true, blendMode, slabThickness, orientation })
          ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
        });
      });
    });
  });

  it('samples a plain slice, and a thickness that gives one sample, on the CPU', () => {
    expect(getSlabSampleOffsets(volume, 0.9).length).toBe(1);
    expect(getSlabSampleOffsets(volume, 1).length).toBeGreaterThan(1);

    blendModes.forEach((blendMode) => {
      [undefined, 0, 0.9].forEach((slabThickness) => {
        orientations.forEach((orientation) => {
          expect(
            modeOf({ sliceFirst: true, blendMode, slabThickness, orientation })
          ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
        });
      });
      expect(
        modeOf({
          sliceFirst: true,
          blendMode,
          slabThickness: 1,
          orientation: OrientationAxis.CORONAL,
        })
      ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    });
  });

  it('goes back to the sampled slice when the slab is turned off', () => {
    const options = { ...mip, orientation: OrientationAxis.CORONAL };

    expect(modeOf(options)).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    expect(modeOf({ ...options, slabThickness: 0 })).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(
      modeOf({ ...options, slabThickness: 0, blendMode: BlendModes.COMPOSITE })
    ).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
  });

  it('follows the global slice first setting when the data set has none', () => {
    const options = { orientation: OrientationAxis.CORONAL };

    setSliceFirst(false);

    expect(modeOf(options)).toBe(ActorRenderMode.VTK_VOLUME_SLICE);

    setSliceFirst(true);

    try {
      expect(modeOf(options)).toBe(ActorRenderMode.VTK_SAMPLED_SLICE);
      expect(
        modeOf({
          ...options,
          slabThickness: 10,
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        })
      ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
      expect(modeOf({ ...options, sliceFirst: false })).toBe(
        ActorRenderMode.VTK_VOLUME_SLICE
      );
    } finally {
      setSliceFirst(false);
    }
  });

  it('does not change the GPU volume path with slice first off', () => {
    blendModes.forEach((blendMode) => {
      [undefined, 0, 10, 300].forEach((slabThickness) => {
        orientations.forEach((orientation) => {
          expect(
            modeOf({ sliceFirst: false, blendMode, slabThickness, orientation })
          ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
        });
      });
    });
  });

  it('does not change the CPU backend', () => {
    blendModes.forEach((blendMode) => {
      [undefined, 0, 10, 300].forEach((slabThickness) => {
        [true, false].forEach((sliceFirst) => {
          expect(
            modeOf({
              renderBackend: 'cpu',
              sliceFirst,
              blendMode,
              slabThickness,
              orientation: OrientationAxis.CORONAL,
            })
          ).toBe(ActorRenderMode.CPU_VOLUME);
        });
      });
    });
  });

  it('counts a slab by its samples along the normal, whatever the blend mode', () => {
    expect(hasSlab(volume, undefined)).toBe(false);
    expect(hasSlab(volume, 0)).toBe(false);
    expect(hasSlab(volume, 0.9)).toBe(false);
    expect(hasSlab(volume, 1)).toBe(true);
    expect(hasSlab(volume, 300)).toBe(true);
  });
});

describe('PlanarViewport remount after presentation changes', () => {
  const displaySetId = 'ct-display-set';
  const volumeId = 'ct-volume';
  const engineId = 'routing-engine';
  const imageIds = Array.from({ length: 10 }, (_, i) => `ct:${i}`);
  let viewport;
  let provider;
  let volume;
  let pendingLoads;
  let deferLoads;
  let props;
  let renderer;
  let renderViewport;
  let pendingAdds;
  let deferAdds;

  const binding = () => viewport.bindings.get(displaySetId);
  const overlayId = 'pt-display-set';

  beforeEach(() => {
    const camera = vtkCamera.newInstance();
    props = [];
    renderer = {
      getActiveCamera: jest.fn(() => camera),
      addActor: jest.fn(),
      removeActor: jest.fn(),
      getActors: jest.fn(() => []),
      resetCameraClippingRange: jest.fn(),
      computeVisiblePropBounds: () => [1, -1, 1, -1, 1, -1],
      getViewProps: () => props,
      addViewProp: (prop) => {
        if (!props.includes(prop)) {
          props.push(prop);
        }
      },
      removeViewProp: (prop) => {
        props = props.filter((item) => item !== prop);
      },
    };

    renderingEngineCache.set({
      id: engineId,
      getRenderer: jest.fn(() => renderer),
      getViewports: jest.fn(() => (viewport ? [viewport] : [])),
      renderViewport: (renderViewport = jest.fn()),
    });
    viewport = new PlanarViewport({
      id: 'routing-viewport',
      element: document.createElement('div'),
      renderingEngineId: engineId,
      canvas: document.createElement('canvas'),
      sWidth: 200,
      sHeight: 100,
      defaultOptions: {},
    });
    provider = (type, imageId) => {
      const i = imageIds.indexOf(imageId);

      if (i < 0 || type !== MetadataModules.IMAGE_PLANE) {
        return;
      }

      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, i * 2],
        rowPixelSpacing: 1,
        columnPixelSpacing: 1,
        rows: 6,
        columns: 8,
        frameOfReferenceUID: 'routing-frame',
      };
    };
    metaData.addProvider(provider, 10000);
    [displaySetId, overlayId].forEach((id) => {
      displaySetRegistry.add(id, {
        imageIds,
        volumeId,
      });
    });
    volume = createVolume({ imageIds });
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => (id === volumeId ? volume : undefined));
    pendingLoads = [];
    deferLoads = false;
    pendingAdds = [];
    deferAdds = false;
    jest
      .spyOn(viewport.dataProvider, 'load')
      .mockImplementation((id, options) => {
        const data = {
          id,
          type: 'image',
          imageIds,
          imageVolume: volume,
          renderMode: options.renderMode,
          volumeId,
        };

        if (!deferLoads) {
          return Promise.resolve(data);
        }

        return new Promise((resolve) => {
          pendingLoads.push(() => resolve(data));
        });
      });
    viewport.renderPathResolver = {
      resolve: (_type, _data, options) => ({
        createRenderPath: () => ({
          addData: async (_ctx, data) => {
            if (deferAdds) {
              await new Promise((resolve) => pendingAdds.push(resolve));
            }

            const actor = {
              displaySetId: data.id,
              renderMode: options.renderMode,
            };

            renderer.addViewProp(actor);

            return {
              rendering: {
                renderMode: options.renderMode,
                imageVolume: volume,
                imageIds,
                currentImageIdIndex: 0,
                maxImageIdIndex: imageIds.length - 1,
              },
              updateDataPresentation: jest.fn(),
              applyViewState: jest.fn(),
              getFrameOfReferenceUID: () => 'routing-frame',
              getActorEntry: () => ({ uid: `${data.id}-actor`, actor }),
              removeData: jest.fn(() => renderer.removeViewProp(actor)),
            };
          },
        }),
      }),
    };
  });

  afterEach(() => {
    viewport.destroy();
    renderingEngineCache.delete(engineId);
    setSliceFirst(false);
    metaData.removeProvider(provider);
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  async function resolvePendingLoads() {
    while (pendingLoads.length) {
      pendingLoads.shift()();
      await flush();
    }
  }

  it('ends on the render mode of the final presentation when a slab comes and goes during a remount', async () => {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, {
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });
    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 1e6 });

    expect(pendingLoads.length).toBe(1);

    viewport.setDisplaySetPresentation(displaySetId, {
      slabThickness: undefined,
    });
    await resolvePendingLoads();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });

  it('still remounts when the final presentation needs the other render mode', async () => {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 1e6 });
    viewport.setDisplaySetPresentation(displaySetId, {
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });
    await resolvePendingLoads();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
  });

  /** Mounts the source and an overlay, both on the axial view. */
  async function mountSourceAndOverlay(options = {}) {
    await viewport.setDisplaySets(
      {
        displaySetId: displaySetId,
        options: { orientation: OrientationAxis.AXIAL, ...options },
      },
      {
        displaySetId: overlayId,
        options: { orientation: OrientationAxis.AXIAL, ...options },
      }
    );
    await flush();
  }

  const mip10 = {
    slabThickness: 10,
    blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
  };

  it('keeps a remounted source actor in front of the overlays in the draw order', async () => {
    await mountSourceAndOverlay({ sliceFirst: true });

    expect(props.map((actor) => actor.displaySetId)).toEqual([
      displaySetId,
      overlayId,
    ]);

    viewport.setDisplaySetPresentation(displaySetId, mip10);
    await flush();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(viewport.bindings.get(overlayId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(
      props.map((actor) => [actor.displaySetId, actor.renderMode])
    ).toEqual([
      [displaySetId, ActorRenderMode.VTK_VOLUME_SLICE],
      [overlayId, ActorRenderMode.VTK_SAMPLED_SLICE],
    ]);

    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 0 });
    await flush();

    expect(
      props.map((actor) => [actor.displaySetId, actor.renderMode])
    ).toEqual([
      [displaySetId, ActorRenderMode.VTK_SAMPLED_SLICE],
      [overlayId, ActorRenderMode.VTK_SAMPLED_SLICE],
    ]);
  });

  it('keeps the places of several bindings remounted in one pass', async () => {
    await mountSourceAndOverlay();

    const labelmap = { displaySetId: 'labelmap' };

    renderer.addViewProp(labelmap);
    setSliceFirst(true);
    await flush();

    expect(
      props.map((actor) => [actor.displaySetId, actor.renderMode])
    ).toEqual([
      [displaySetId, ActorRenderMode.VTK_SAMPLED_SLICE],
      [overlayId, ActorRenderMode.VTK_SAMPLED_SLICE],
      ['labelmap', undefined],
    ]);
  });

  it('holds the renders between the remount of the source and of the overlay', async () => {
    await mountSourceAndOverlay();

    deferAdds = true;
    setSliceFirst(true);
    await flush();

    const rendersBefore = renderViewport.mock.calls.length;

    expect(pendingAdds.length).toBe(1);

    pendingAdds.shift()();
    await flush();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(pendingAdds.length).toBe(1);

    viewport.render();

    expect(renderViewport.mock.calls.length).toBe(rendersBefore);

    pendingAdds.shift()();
    await flush();

    expect(viewport.bindings.get(overlayId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
    expect(renderViewport.mock.calls.length).toBeGreaterThan(rendersBefore);
  });

  it('holds the renders that a slab change asks for until its remount ends', async () => {
    await mountSourceAndOverlay({ sliceFirst: true });

    const rendersBefore = renderViewport.mock.calls.length;

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, mip10);
    viewport.setDisplaySetPresentation(overlayId, mip10);
    viewport.render();
    await flush();

    expect(renderViewport.mock.calls.length).toBe(rendersBefore);

    await resolvePendingLoads();

    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(viewport.bindings.get(overlayId).rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(renderViewport.mock.calls.length).toBeGreaterThan(rendersBefore);
  });

  it('keeps the draw order when the remount goes stale', async () => {
    await mountSourceAndOverlay({ sliceFirst: true });

    const propsBefore = [...props];

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, mip10);
    viewport.setDisplaySetPresentation(displaySetId, { slabThickness: 0 });
    await resolvePendingLoads();

    expect(props).toEqual(propsBefore);
    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_SAMPLED_SLICE
    );
  });

  it('gives a slab that moves to another render mode to the remounted binding only', async () => {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    const mounted = binding();
    const voiRange = { lower: 0, upper: 100 };

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, { ...mip10, voiRange });

    expect(mounted.updateDataPresentation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        voiRange,
        slabThickness: undefined,
        blendMode: undefined,
      })
    );
    expect(viewport.getDisplaySetPresentation(displaySetId)).toEqual(
      expect.objectContaining({ ...mip10, voiRange })
    );

    viewport.setDisplaySetPresentation(displaySetId, { opacity: 0.5 });

    expect(mounted.updateDataPresentation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        voiRange,
        opacity: 0.5,
        slabThickness: undefined,
        blendMode: undefined,
      })
    );

    await resolvePendingLoads();

    expect(binding()).not.toBe(mounted);
    expect(binding().rendering.renderMode).toBe(
      ActorRenderMode.VTK_VOLUME_SLICE
    );
    expect(binding().updateDataPresentation).toHaveBeenLastCalledWith(
      expect.objectContaining({ ...mip10, voiRange, opacity: 0.5 })
    );
  });

  it('gives the mounted binding a slab that keeps its render mode at once', async () => {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: { orientation: OrientationAxis.AXIAL, sliceFirst: true },
    });
    await flush();

    const mounted = binding();

    deferLoads = true;
    viewport.setDisplaySetPresentation(displaySetId, mip10);
    viewport.setDisplaySetPresentation(displaySetId, {
      slabThickness: 0.9,
      blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
    });

    expect(mounted.updateDataPresentation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        slabThickness: 0.9,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      })
    );

    await resolvePendingLoads();

    expect(binding()).toBe(mounted);
  });

  it('gives the whole presentation at once with slice first off', async () => {
    await viewport.setDisplaySets({
      displaySetId: displaySetId,
      options: { orientation: OrientationAxis.AXIAL },
    });
    await flush();

    const mounted = binding();

    viewport.setDisplaySetPresentation(displaySetId, mip10);
    await flush();

    expect(binding()).toBe(mounted);
    expect(mounted.updateDataPresentation).toHaveBeenLastCalledWith(
      expect.objectContaining(mip10)
    );
  });
});

describe('order of the view props after a remount', () => {
  const [source, overlay, labelmap, frame] = [
    'source',
    'overlay',
    'labelmap',
    'frame',
  ];
  const newSource = 'new source';

  it('puts the new actor in the place of the actor it replaces', () => {
    expect(
      getRemountedViewPropOrder(
        [source, overlay, labelmap],
        [overlay, labelmap, newSource],
        [newSource]
      )
    ).toEqual([newSource, overlay, labelmap]);
  });

  it('takes the place of the first removed actor when the old binding drew an acquired frame', () => {
    expect(
      getRemountedViewPropOrder(
        [source, overlay, frame, labelmap],
        [overlay, labelmap, newSource],
        [newSource]
      )
    ).toEqual([newSource, overlay, labelmap]);
    expect(
      getRemountedViewPropOrder(
        [source, overlay],
        [overlay, newSource, frame],
        [newSource, frame]
      )
    ).toEqual([newSource, frame, overlay]);
  });

  it('keeps the order when nothing was removed or nothing was added', () => {
    expect(
      getRemountedViewPropOrder([overlay], [overlay, newSource], [newSource])
    ).toBeUndefined();
    expect(
      getRemountedViewPropOrder([source, overlay], [source, overlay], [source])
    ).toBeUndefined();
    expect(
      getRemountedViewPropOrder([source, overlay], [overlay], [])
    ).toBeUndefined();
  });

  it('leaves at the end a prop that something else added during the remount', () => {
    expect(
      getRemountedViewPropOrder(
        [source, overlay],
        [overlay, labelmap, newSource],
        [newSource]
      )
    ).toEqual([newSource, overlay, labelmap]);
  });

  it('returns undefined when the new actor already has the place', () => {
    expect(
      getRemountedViewPropOrder(
        [overlay, source],
        [overlay, newSource],
        [newSource]
      )
    ).toBeUndefined();
  });
});

describe('GPU volume textures after a switch to slice first', () => {
  const volumeId = 'texture-volume';
  let volume;

  /** A real volume, so the strategies provision and claim real texture sets. */
  function makeVolume() {
    const dimensions = [16, 16, 4];

    return new ImageVolume({
      volumeId,
      metadata: { FrameOfReferenceUID: 'texture-frame' },
      dimensions,
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageIds: [],
      dataType: 'Float32Array',
      numberOfComponents: 1,
      voxelManager: VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: new Float32Array(dimensions[0] * dimensions[1] * 4),
        numberOfComponents: 1,
      }),
    });
  }

  /**
   * The strategy state of one GPU volume rendering of the volume, as the
   * render path builds it when it mounts: provision, then select and claim.
   */
  function mountRendering(viewportId) {
    const rendering = {
      imageVolume: volume,
      viewportId,
      actor: {},
      mapper: { setScalarTexture: jest.fn(), modified: jest.fn() },
    };

    lifecycle.provisionStrategies(
      rendering,
      defaultVolumeStrategyProvider,
      'initial'
    );
    lifecycle.applyStrategy(rendering, {
      provideStrategies: defaultVolumeStrategyProvider,
      selectStrategy: selectFirstReadyStrategy,
    });

    return rendering;
  }

  function removeRendering(rendering) {
    new VtkVolumeSliceRenderPath().removeData(
      { vtk: { renderer: { removeActor: jest.fn() } } },
      rendering
    );
  }

  beforeEach(() => {
    volumeTextureStore.clear();
    volumeTextureStore.setBudget(0);
    volume = makeVolume();
  });

  afterEach(() => {
    setSliceFirst(false);
    volumeTextureStore.clear();
  });

  it('frees the sets of a volume when the last GPU volume rendering leaves while slice first is on', () => {
    const first = mountRendering('viewport-1');
    const second = mountRendering('viewport-2');
    const [set] = volume.textureSets;

    expect(volume.textureSets.length).toBe(1);
    expect(set.references).toBe(2);

    setSliceFirst(true);
    removeRendering(first);

    expect(volume.textureSets).toEqual([set]);
    expect(set.references).toBe(1);

    removeRendering(second);

    expect(volume.textureSets).toEqual([]);
    expect(ImageVolume.textureBytesUsed).toBe(0);
  });

  it('keeps the sets while slice first is off', () => {
    const first = mountRendering('viewport-1');
    const second = mountRendering('viewport-2');

    removeRendering(first);
    removeRendering(second);

    expect(volume.textureSets.length).toBe(1);
    expect(volume.textureSets[0].references).toBe(0);
  });

  it('keeps a set that another consumer still holds', () => {
    const rendering = mountRendering('viewport-1');
    const [set] = volume.textureSets;

    volume.claimTextureSet(set.name);
    setSliceFirst(true);
    removeRendering(rendering);

    expect(volume.textureSets).toEqual([set]);
    expect(set.references).toBe(1);
  });
});
