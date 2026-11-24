jest.mock('../src/RenderingEngine/helpers/cpuFallback/drawImageSync', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, Events, InterpolationType } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import drawImageSync from '../src/RenderingEngine/helpers/cpuFallback/drawImageSync';
import * as setDefaultVolumeVOIModule from '../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import { CpuVolumeSliceRenderPath } from '../src/RenderingEngine/Viewports/Planar/CpuVolumeSliceRenderPath';
import {
  PlanarSampledSliceCanvas,
  getSliceCanvasTransform,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceCanvas';
import {
  PlanarSliceSampler,
  getScreenSliceGeometry,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSlice';
import { worldToCanvasPlanarViewState } from '../src/RenderingEngine/Viewports/Planar/planarAdapterCoordinateTransforms';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceRest';
import VoxelManager from '../src/utilities/VoxelManager';
import eventTarget from '../src/eventTarget';
import { getConfiguration } from '../src/init';
import { shownStateOf } from '../src/RenderingEngine/helpers/fidelityIndicator/fidelityIndicatorState';
import { fidelityLinesFromBindings } from '../src/RenderingEngine/helpers/fidelityIndicator/collectFidelityLines';

/**
 * The value of voxel (i, j, k) of the test volume: its three indices as the
 * digits of one number, so a pixel tells which voxel it came from.
 */
function voxelValue(i, j, k) {
  return i + j * 10 + k * 100;
}

/**
 * A 4 x 4 x 4 volume with unit spacing at the origin, whose voxels hold
 * `voxelValue` (plus `offset`), with a real voxel manager.
 */
function createTestVolume({
  volumeId = 'cpu-volume',
  ArrayType = Int16Array,
  modality = 'CT',
  offset = 0,
  dynamic = false,
} = {}) {
  const dimensions = [4, 4, 4];
  const scalarData = new ArrayType(64);
  const fill = (add) => {
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          scalarData[i + j * 4 + k * 16] = voxelValue(i, j, k) + add;
        }
      }
    }
  };

  fill(offset);

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing([1, 1, 1]);
  imageData.setOrigin([0, 0, 0]);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  const volume = {
    volumeId,
    imageIds: ['image-0', 'image-1', 'image-2', 'image-3'],
    dimensions,
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageData,
    metadata: { Modality: modality, FrameOfReferenceUID: 'cpu-frame' },
    loadStatus: { loaded: true, loading: false },
    load: jest.fn(),
    voxelGrid: { dimensions, spacing: [1, 1, 1] },
    getVoxelQuality: jest.fn(() => undefined),
    isDynamicVolume: () => dynamic,
    dimensionGroupNumber: 1,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData,
    }),
    refill: fill,
  };

  volume.voxelManager.invalidateCache = jest.fn();

  return volume;
}

/**
 * A 4 x 4 x 4 colour volume with unit spacing at the origin and a real voxel
 * manager. Component c of voxel (i, j, k) is i + 4 j + 16 k + 64 c, so a
 * pixel tells which voxel it came from and the components of one pixel
 * differ by 64.
 */
function createColourVolume(numberOfComponents) {
  const volume = createTestVolume({
    volumeId: `colour-volume-${numberOfComponents}`,
    ArrayType: Uint8Array,
  });
  const scalarData = new Uint8Array(64 * numberOfComponents);

  for (let voxel = 0; voxel < 64; voxel++) {
    for (let component = 0; component < numberOfComponents; component++) {
      scalarData[voxel * numberOfComponents + component] =
        voxel + 64 * component;
    }
  }

  volume.voxelManager = VoxelManager.createScalarVolumeVoxelManager({
    dimensions: volume.dimensions,
    scalarData,
    numberOfComponents,
  });
  volume.voxelManager.invalidateCache = jest.fn();

  return volume;
}

function createCanvas(width = 1, height = 1) {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function coronalCamera(focalPoint, parallelScale = 0.5) {
  return {
    focalPoint,
    parallelScale,
    viewPlaneNormal: [0, 1, 0],
    viewUp: [0, 0, 1],
  };
}

function axialCamera(k, parallelScale = 2) {
  return {
    focalPoint: [1.5, 1.5, k],
    parallelScale,
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
  };
}

function obliqueCamera() {
  const normal = [Math.SQRT1_2, 0, Math.SQRT1_2];

  return {
    focalPoint: [1.5, 1.5, 1.5],
    parallelScale: 2,
    viewPlaneNormal: normal,
    viewUp: [0, 1, 0],
  };
}

/**
 * The context of the CPU volume path. The display set is an overlay
 * (`isCurrentDisplaySetId` is false), which follows the camera of the view and
 * needs no resolved view of the viewport.
 */
function createContext(canvas, camera) {
  const element = document.createElement('div');

  return {
    viewportId: 'viewport-1',
    renderingEngineId: 'rendering-engine',
    viewport: {
      element,
      getViewState: jest.fn(() => ({})),
      isCurrentDisplaySetId: jest.fn(() => false),
      invalidateResolvedView: jest.fn(),
    },
    view: { activeSourceICamera: camera },
    display: {
      activateRenderMode: jest.fn(),
      markRendered: jest.fn(),
      renderNow: jest.fn(),
      setNeedsRender: jest.fn(),
      requestRender: jest.fn(),
    },
    cpu: {
      canvas,
      context: canvas.getContext('2d'),
      composition: { clearedRenderPassId: -1, renderPassId: 1 },
    },
  };
}

/**
 * Mounts a volume on the CPU volume path and makes `renderNow` render it, as
 * the viewport does.
 */
async function mount({
  volume = createTestVolume(),
  canvas = createCanvas(),
  camera = coronalCamera([1.5, 1.5, 1.5]),
  presentation,
  reference,
} = {}) {
  const ctx = createContext(canvas, camera);
  const path = new CpuVolumeSliceRenderPath();
  const attachment = await path.addData(
    ctx,
    {
      id: `${volume.volumeId}:data`,
      type: 'image',
      volumeId: volume.volumeId,
      imageIds: volume.imageIds,
      imageVolume: volume,
      initialImageIdIndex: 0,
      reference,
    },
    {}
  );

  ctx.display.renderNow.mockImplementation(() => attachment.render());

  if (presentation) {
    attachment.updateDataPresentation(presentation);
  }

  return { ctx, attachment, volume, rendering: attachment.rendering };
}

let drawSpy;
let putImageDataSpy;

/** The image of the slice that the draw step drew last. */
function lastDrawnImage() {
  return drawSpy.mock.contexts.at(-1).getImage();
}

/** The RGBA bytes of the slice that the draw step coloured last. */
function lastColouredPixels() {
  return Array.from(putImageDataSpy.mock.calls.at(-1)[0].data);
}

function lastDrawnPixels() {
  return Array.from(lastDrawnImage().getPixelData());
}

describe('CpuVolumeSliceRenderPath', () => {
  let voiSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    voiSpy = jest
      .spyOn(setDefaultVolumeVOIModule, 'getDefaultVolumeVOIRange')
      .mockResolvedValue({ lower: 0, upper: 400 });
    drawSpy = jest.spyOn(PlanarSampledSliceCanvas.prototype, 'draw');
    putImageDataSpy = jest.spyOn(
      CanvasRenderingContext2D.prototype,
      'putImageData'
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    voiSpy.mockRestore();
    drawSpy.mockRestore();
    putImageDataSpy.mockRestore();
  });

  it('samples once and redraws from the kept slice while the plane stays', async () => {
    const { attachment, rendering } = await mount();

    attachment.render();
    attachment.render();

    expect(rendering.getSliceCacheStatistics().misses).toBe(1);
    expect(drawSpy).toHaveBeenCalledTimes(2);
    expect(drawSpy.mock.calls[0][0].invalidated).toBe(true);
    expect(drawSpy.mock.calls[1][0].invalidated).toBe(false);
    expect(putImageDataSpy).toHaveBeenCalledTimes(1);
    expect(rendering.renderingInvalidated).toBe(false);
  });

  it('emits IMAGE_RENDERED for each render, also from the kept slice', async () => {
    const { attachment, ctx } = await mount();
    const listener = jest.fn();

    ctx.viewport.element.addEventListener(Events.IMAGE_RENDERED, listener);
    attachment.render();
    attachment.render();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(ctx.display.markRendered).toHaveBeenCalledTimes(2);
  });

  it('keeps the actor entry, the image data and the frame of reference of the volume', async () => {
    const { attachment, rendering, volume } = await mount();
    const entry = attachment.getActorEntry({
      id: 'cpu-volume:data',
      volumeId: volume.volumeId,
      imageIds: volume.imageIds,
    });
    const imageData = attachment.getImageData();

    expect(entry.actorMapper.renderMode).toBe(ActorRenderMode.CPU_VOLUME);
    expect(entry.actor).toBe(rendering.compatibilityActor);
    expect(entry.actor.getClassName()).toBe('CanvasActor');
    expect(imageData.dimensions).toEqual([4, 4, 4]);
    expect(imageData.voxelManager).toBe(volume.voxelManager);
    expect(attachment.getFrameOfReferenceUID()).toBe('cpu-frame');
  });

  it('draws a LINEAR straight cut of voxel size first, then the screen grid at rest', async () => {
    const { attachment, rendering } = await mount();

    attachment.render();

    expect(lastDrawnImage().width).toBe(4);
    expect(lastDrawnImage().height).toBe(4);

    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

    expect(rendering.getSliceCacheStatistics().refined).toBe(1);
    expect(lastDrawnImage().width).toBe(1);
    expect(lastDrawnPixels()).toEqual([167]);
  });

  it('samples a linear plane through the half-voxel boundary of the volume', async () => {
    const { attachment } = await mount({
      camera: coronalCamera([1.5, -0.25, 1.5]),
    });

    attachment.render();
    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

    expect(lastDrawnPixels()).toEqual([152]);
  });

  it('draws nothing for a plane outside the volume', async () => {
    const { attachment, ctx } = await mount({
      camera: coronalCamera([1.5, -0.75, 1.5]),
    });

    attachment.render();

    expect(drawSpy).not.toHaveBeenCalled();
    expect(ctx.display.markRendered).not.toHaveBeenCalled();
  });

  it('keeps a NEAREST straight cut at voxel size, on the nearest slice, without smoothing', async () => {
    const { attachment, ctx, rendering } = await mount({
      presentation: { interpolationType: InterpolationType.NEAREST },
    });
    const smoothing = [];

    jest.spyOn(ctx.cpu.context, 'drawImage').mockImplementation(function () {
      smoothing.push(this.imageSmoothingEnabled);
    });
    attachment.render();
    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

    expect(rendering.getSliceCacheStatistics().refined).toBe(0);
    expect(lastDrawnImage().width).toBe(4);
    expect(smoothing.at(-1)).toBe(false);
    expect(
      lastDrawnPixels().every((value) => Math.floor(value / 10) % 10 === 1)
    ).toBe(true);
  });

  it('samples an oblique slice on the screen grid at rest', async () => {
    const { attachment, rendering } = await mount({
      canvas: createCanvas(20, 10),
      camera: obliqueCamera(),
      presentation: { interpolationType: InterpolationType.NEAREST },
    });

    attachment.render();

    const voxelSize = lastDrawnImage();

    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

    expect(voxelSize.width).not.toBe(20);
    expect(rendering.getSliceCacheStatistics().refined).toBe(1);
    expect(lastDrawnImage().width).toBe(20);
    expect(lastDrawnImage().height).toBe(10);
  });

  it('does not sample again for zoom, pan or VOI', async () => {
    const camera = axialCamera(1);
    const { attachment, ctx, rendering } = await mount({
      canvas: createCanvas(8, 8),
      camera,
      presentation: { interpolationType: InterpolationType.NEAREST },
    });

    attachment.render();
    ctx.view.activeSourceICamera = { ...camera, parallelScale: 1 };
    attachment.render();
    ctx.view.activeSourceICamera = {
      ...camera,
      parallelScale: 1,
      focalPoint: [1, 1, 1],
    };
    attachment.render();
    attachment.updateDataPresentation({
      interpolationType: InterpolationType.NEAREST,
      voiRange: { lower: 0, upper: 100 },
    });
    attachment.render();

    expect(rendering.getSliceCacheStatistics().misses).toBe(1);
    expect(drawSpy.mock.calls.at(-1)[0].invalidated).toBe(true);
    expect(lastDrawnImage().minPixelValue).toBeGreaterThanOrEqual(100);
    expect(lastColouredPixels().every((value) => value === 255)).toBe(true);
  });

  it('finds a prefetched neighbour slice on a scroll', async () => {
    const { attachment, ctx, rendering } = await mount({
      canvas: createCanvas(8, 8),
      camera: axialCamera(1),
      presentation: { interpolationType: InterpolationType.NEAREST },
    });

    attachment.render();
    ctx.view.activeSourceICamera = axialCamera(2);
    attachment.render();
    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);
    jest.runOnlyPendingTimers();

    expect(rendering.getSliceCacheStatistics().prefetched).toBeGreaterThan(0);

    const misses = rendering.getSliceCacheStatistics().misses;

    ctx.view.activeSourceICamera = axialCamera(3);
    attachment.render();

    expect(rendering.getSliceCacheStatistics().misses).toBe(misses);
    expect(rendering.getSliceCacheStatistics().hits).toBe(1);
    expect(
      lastDrawnPixels().every((value) => Math.floor(value / 100) === 3)
    ).toBe(true);
  });

  it('draws maximum, minimum and average slabs', async () => {
    const pixelsOf = async (blendMode) => {
      const { attachment } = await mount({
        canvas: createCanvas(8, 8),
        camera: axialCamera(1),
        presentation: {
          interpolationType: InterpolationType.NEAREST,
          slabThickness: 2,
          blendMode,
        },
      });

      attachment.render();

      return lastDrawnPixels();
    };
    const maximum = await pixelsOf(BlendModes.MAXIMUM_INTENSITY_BLEND);
    const minimum = await pixelsOf(BlendModes.MINIMUM_INTENSITY_BLEND);
    const average = await pixelsOf(BlendModes.AVERAGE_INTENSITY_BLEND);

    expect(maximum.every((value) => value >= 100)).toBe(true);
    expect(minimum.every((value) => value < 100)).toBe(true);
    expect(
      average.every(
        (value, index) => value > minimum[index] && value < maximum[index]
      )
    ).toBe(true);
  });

  it('draws the plain slice for a slab beyond the CPU work limit, then the slab sampled in steps at rest', async () => {
    const { attachment, rendering } = await mount({
      canvas: createCanvas(8, 8),
      camera: axialCamera(1),
      presentation: {
        interpolationType: InterpolationType.NEAREST,
        slabThickness: 2e5,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
      },
    });

    attachment.render();
    rendering.refreshFidelity();

    expect(
      lastDrawnPixels().every((value) => Math.floor(value / 100) === 1)
    ).toBe(true);
    expect(rendering.qualityPending).toBe(true);

    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);
    jest.runAllTimers();
    rendering.refreshFidelity();

    expect(
      lastDrawnPixels().every((value) => Math.floor(value / 100) === 3)
    ).toBe(true);
    expect(rendering.qualityPending).toBe(false);
  });

  it('samples again and renders when the time point of a dynamic volume changes', async () => {
    const volume = createTestVolume({ dynamic: true });
    const { attachment, ctx, rendering } = await mount({
      volume,
      canvas: createCanvas(8, 8),
      camera: axialCamera(1),
      presentation: { interpolationType: InterpolationType.NEAREST },
    });

    attachment.render();
    volume.dimensionGroupNumber = 2;
    volume.refill(1000);
    eventTarget.dispatchEvent(
      new CustomEvent(Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED, {
        detail: { volumeId: volume.volumeId },
      })
    );

    expect(ctx.display.renderNow).toHaveBeenCalledTimes(1);
    expect(rendering.getSliceCacheStatistics().misses).toBe(2);
    expect(lastDrawnPixels().every((value) => value >= 1100)).toBe(true);

    attachment.removeData();
  });

  it('drops the kept slices at once on IMAGE_VOLUME_MODIFIED and renders at most once per throttle period', async () => {
    const cpuVolume = getConfiguration().rendering.planar.cpuVolume;
    const throttleMs = cpuVolume.volumeModifiedThrottleMs;

    cpuVolume.volumeModifiedThrottleMs = 50;

    const { attachment, ctx, rendering, volume } = await mount();
    const modified = () =>
      eventTarget.dispatchEvent(
        new CustomEvent(Events.IMAGE_VOLUME_MODIFIED, {
          detail: { volumeId: volume.volumeId },
        })
      );

    attachment.render();
    modified();
    modified();

    expect(ctx.display.renderNow).toHaveBeenCalledTimes(1);
    expect(volume.voxelManager.invalidateCache).toHaveBeenCalledTimes(2);

    attachment.render();

    expect(rendering.getSliceCacheStatistics().misses).toBe(3);

    jest.advanceTimersByTime(50);

    expect(ctx.display.renderNow).toHaveBeenCalledTimes(2);

    attachment.removeData();
    cpuVolume.volumeModifiedThrottleMs = throttleMs;
  });

  it('clears the voxel cache again on the deferred loading-completed render', async () => {
    let animationFrameCallback;
    const requestAnimationFrame = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrameCallback = callback;

        return 1;
      });
    const cancelAnimationFrame = jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(jest.fn());
    const { attachment, ctx, volume } = await mount();

    ctx.display.renderNow.mockImplementation(jest.fn());
    eventTarget.dispatchEvent(
      new CustomEvent(Events.IMAGE_VOLUME_LOADING_COMPLETED, {
        detail: { volumeId: volume.volumeId },
      })
    );

    expect(volume.voxelManager.invalidateCache).toHaveBeenCalledTimes(1);
    expect(ctx.display.renderNow).toHaveBeenCalledTimes(1);

    animationFrameCallback();

    expect(volume.voxelManager.invalidateCache).toHaveBeenCalledTimes(2);
    expect(ctx.display.renderNow).toHaveBeenCalledTimes(2);

    attachment.removeData();
    requestAnimationFrame.mockRestore();
    cancelAnimationFrame.mockRestore();
  });

  it('starts the load of a volume with no voxels yet and draws nothing', async () => {
    const volume = createTestVolume();

    volume.loadStatus = { loaded: false, loading: false };

    const { attachment, ctx } = await mount({ volume });

    attachment.render();
    attachment.render();

    expect(volume.load).toHaveBeenCalledTimes(1);
    expect(ctx.display.setNeedsRender).toHaveBeenCalled();
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it('records the volume quality and never reports an interactive reduction', async () => {
    const volume = createTestVolume();
    const record = {
      grid: { spacing: [1, 1, 1] },
      missing: 0,
      voxels: 1,
      lowest: 8,
      reduction: 'none',
    };

    volume.getVoxelQuality = jest.fn(() => record);

    const { attachment, rendering } = await mount({ volume });

    attachment.render();

    expect(rendering.voxelQuality).toBe(record);
    expect(rendering.fullGrid).toBe(volume.voxelGrid);
    expect(rendering.interactiveReduction).toBe(false);
    expect(
      shownStateOf(
        fidelityLinesFromBindings(undefined, [
          {
            record: rendering.voxelQuality,
            fullGrid: rendering.fullGrid,
            interactiveReduction: rendering.interactiveReduction,
          },
        ])
      )
    ).toBe('done');
  });

  it.each([
    [3, false],
    [4, true],
  ])(
    'draws a colour volume of %p components as a colour image',
    async (numberOfComponents, rgba) => {
      const { attachment } = await mount({
        volume: createColourVolume(numberOfComponents),
        canvas: createCanvas(8, 8),
        camera: axialCamera(1),
        presentation: { interpolationType: InterpolationType.NEAREST },
      });

      attachment.render();

      const image = lastDrawnImage();
      const pixels = lastDrawnPixels();

      expect(image.color).toBe(true);
      expect(image.rgba).toBe(rgba);
      expect(image.numberOfComponents).toBe(numberOfComponents);
      expect(image.getPixelData()).toBeInstanceOf(Uint8Array);
      expect(pixels).toHaveLength(16 * numberOfComponents);

      const voxels = [];

      for (let pixel = 0; pixel < 16; pixel++) {
        const first = pixels[pixel * numberOfComponents];

        voxels.push(first);
        expect(Math.floor(first / 16)).toBe(1);

        for (let component = 1; component < numberOfComponents; component++) {
          expect(pixels[pixel * numberOfComponents + component]).toBe(
            first + 64 * component
          );
        }
      }

      expect(voxels.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 16 }, (_, index) => 16 + index)
      );
    }
  );

  it('draws a LINEAR oblique slice of a colour volume on the screen grid at rest', async () => {
    const { attachment, rendering } = await mount({
      volume: createColourVolume(3),
      canvas: createCanvas(12, 10),
      camera: obliqueCamera(),
    });

    attachment.render();
    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);

    const image = lastDrawnImage();
    const pixels = lastDrawnPixels();

    expect(rendering.getSliceCacheStatistics().refined).toBe(1);
    expect(image.color).toBe(true);
    expect(image.width).toBe(12);
    expect(pixels).toHaveLength(12 * 10 * 3);
    expect(pixels.some((value) => value > 0)).toBe(true);
    expect(image.maxPixelValue).toBeLessThanOrEqual(255);
  });

  it('colours a labelmap with its canvas actor and not with the VOI pipeline', async () => {
    const { attachment, rendering } = await mount({
      volume: createTestVolume({ ArrayType: Uint8Array }),
      reference: { kind: 'segmentation' },
      presentation: { interpolationType: InterpolationType.NEAREST },
    });
    const renderActor = jest
      .spyOn(rendering.compatibilityActor, 'render')
      .mockImplementation(jest.fn());

    attachment.render();

    const actorImage = rendering.compatibilityActor.getImage();

    expect(drawImageSync).not.toHaveBeenCalled();
    expect(renderActor).toHaveBeenCalledTimes(1);
    expect(actorImage.width).toBe(4);
    expect(actorImage.getScalarData()).toBeInstanceOf(Uint8Array);
  });
});

describe('PlanarSampledSliceCanvas', () => {
  const slice = (pixelData, overrides = {}) => ({
    pixelData,
    width: 2,
    height: 1,
    origin: [0, 0, 0],
    xDirection: [1, 0, 0],
    yDirection: [0, 1, 0],
    zDirection: [0, 0, 1],
    spacing: [1, 1],
    min: Math.min(...pixelData),
    max: Math.max(...pixelData),
    insideVolume: true,
    sampledFor: { interpolationType: InterpolationType.LINEAR, sliceIndex: 0 },
    ...overrides,
  });

  it('rounds the float samples of a CT slice for the LUT and keeps those of a PT slice', () => {
    const ct = new PlanarSampledSliceCanvas(
      createTestVolume({ ArrayType: Float32Array }),
      4,
      4
    );
    const pt = new PlanarSampledSliceCanvas(
      createTestVolume({ ArrayType: Float32Array, modality: 'PT' }),
      4,
      4
    );
    const samples = new Float32Array([1.4, 2.6]);
    const ctImage = ct.setSlice(slice(samples)).image;
    const ptImage = pt.setSlice(slice(samples)).image;

    expect(Array.from(ctImage.getPixelData())).toEqual([1, 3]);
    expect(ctImage.minPixelValue).toBe(1);
    expect(ctImage.maxPixelValue).toBe(3);
    expect(ptImage.getPixelData()).toBe(samples);
    expect(ptImage.minPixelValue).toBeCloseTo(1.4);
  });

  it('makes an RGBA image of a slice with 4 components', () => {
    const canvas = new PlanarSampledSliceCanvas(createColourVolume(4), 4, 4);
    const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
    const image = canvas.setSlice(
      slice(pixels, { numberOfComponents: 4 })
    ).image;

    expect(image.color).toBe(true);
    expect(image.rgba).toBe(true);
    expect(image.numberOfComponents).toBe(4);
    expect(image.getPixelData()).toBe(pixels);
    expect(image.voxelManager.getAtIndex(1)).toEqual([4, 5, 6]);
  });

  /**
   * Draws a slice of float values with a presentation on a fresh target and
   * returns the RGBA bytes of the coloured slice and the transform it was
   * drawn with.
   */
  const drawSlice = (volume, sliceToDraw, presentation) => {
    const canvas = new PlanarSampledSliceCanvas(volume, 4, 4);
    const target = createCanvas(4, 4);
    const context = target.getContext('2d');
    const putImageData = jest.spyOn(
      context.constructor.prototype,
      'putImageData'
    );
    const setTransform = jest.spyOn(context, 'setTransform');

    canvas.setSlice(sliceToDraw);
    canvas.draw({
      target: {
        canvas: target,
        context,
        composition: { clearedRenderPassId: -1, renderPassId: 1 },
      },
      camera: {
        focalPoint: [2, 0.5, 0],
        parallelScale: 2,
        viewPlaneNormal: [0, 0, -1],
        viewUp: [0, -1, 0],
      },
      presentation,
      invalidated: true,
    });

    const pixels = Array.from(putImageData.mock.calls.at(-1)[0].data);
    const transform = setTransform.mock.calls.at(-1);

    putImageData.mockRestore();

    return { pixels, transform };
  };
  const channel = (pixels, offset) => pixels.filter((_, i) => i % 4 === offset);

  it('colours a slice with the colour table of the GPU draw step, over the VOI and between whole values', () => {
    const { pixels } = drawSlice(
      createTestVolume(),
      slice(new Float32Array([0, 100, 200.5, 400]), { width: 4 }),
      { voiRange: { lower: 0, upper: 400 } }
    );

    channel(pixels, 0).forEach((red, index) => {
      expect(
        Math.abs(red - (255 * [0, 100, 200.5, 400][index]) / 400)
      ).toBeLessThanOrEqual(1);
    });
    expect(channel(pixels, 0)).toEqual(channel(pixels, 1));
    expect(channel(pixels, 3)).toEqual([255, 255, 255, 255]);
  });

  it('reads the values of a colormap opacity array as values of the data, as the legacy volume viewport and the GPU draw step do', () => {
    const { pixels } = drawSlice(
      createTestVolume({ ArrayType: Float32Array, modality: 'PT' }),
      slice(new Float32Array([0, 1, 5, 10]), { width: 4 }),
      {
        voiRange: { lower: 0, upper: 20 },
        colormap: {
          name: 'hsv',
          opacity: [
            { value: 0, opacity: 0 },
            { value: 10, opacity: 1 },
          ],
        },
      }
    );
    const alphas = channel(pixels, 3);

    [0, 25.5, 127.5, 255].forEach((alpha, index) => {
      expect(Math.abs(alphas[index] - alpha)).toBeLessThanOrEqual(1);
    });
  });

  it('multiplies the alpha by the opacity of the presentation', () => {
    const { pixels } = drawSlice(
      createTestVolume(),
      slice(new Float32Array([0, 400])),
      { voiRange: { lower: 0, upper: 400 }, opacity: 0.5 }
    );

    expect(channel(pixels, 3)).toEqual([128, 128]);
  });

  it('leaves the pixels outside the faces of the volume clear', () => {
    const { pixels } = drawSlice(
      createTestVolume(),
      slice(new Float32Array([100, 100, 100, 100]), {
        width: 4,
        origin: [-1.25, 1, 1],
        insideVolume: false,
      }),
      { voiRange: { lower: 0, upper: 400 } }
    );

    expect(channel(pixels, 3)).toEqual([0, 255, 255, 255]);
  });

  it('moves a NEAREST slice back by a small part of a pixel, so that a tie shows the next pixel as the GPU does', () => {
    const presentation = { voiRange: { lower: 0, upper: 400 } };
    const values = new Float32Array([0, 400]);
    const linear = drawSlice(createTestVolume(), slice(values), presentation);
    const nearest = drawSlice(createTestVolume(), slice(values), {
      ...presentation,
      interpolationType: InterpolationType.NEAREST,
    });
    const [a, b, c, d, e, f] = linear.transform;

    expect(nearest.transform[4]).toBeCloseTo(e - (a + c) / 8192, 9);
    expect(nearest.transform[5]).toBeCloseTo(f - (b + d) / 8192, 9);
    expect(nearest.transform[4]).toBeLessThan(e);
  });

  it('blends a translucent slice of the screen grid with its alpha before rounding, as the GPU blends a layer', () => {
    const camera = axialCamera(1);
    const screen = getScreenSliceGeometry({
      camera,
      canvasWidth: 4,
      canvasHeight: 4,
    });
    const values = new Float32Array(16).fill(0);

    values[0] = 255;
    values[1] = 1;

    const canvas = new PlanarSampledSliceCanvas(createTestVolume(), 4, 4);
    const target = createCanvas(4, 4);
    const context = target.getContext('2d');
    const below = context.createImageData(4, 4);

    below.data.forEach((_, index) => {
      below.data[index] = index % 4 === 3 ? 255 : 128;
    });
    jest.spyOn(context, 'getImageData').mockReturnValue(below);

    const putImageData = jest.spyOn(context, 'putImageData');

    canvas.setSlice(slice(values, { ...screen, zDirection: [0, 0, 1] }));
    canvas.draw({
      target: {
        canvas: target,
        context,
        composition: { clearedRenderPassId: -1, renderPassId: 1 },
      },
      camera,
      presentation: {
        voiRange: { lower: 0, upper: 255 },
        colormap: {
          name: 'hsv',
          opacity: [
            { value: 0, opacity: 0 },
            { value: 255, opacity: 0.6 },
          ],
        },
      },
      invalidated: true,
    });

    const call = putImageData.mock.calls.find(([data]) => data === below);
    const pixel = (index) =>
      Array.from(below.data.slice(index * 4, index * 4 + 4));

    expect(getSliceCanvasTransform(screen, camera, target)).toEqual([
      1, 0, 0, 1, 0, 0,
    ]);
    expect(call).toBeDefined();
    expect(pixel(0)).toEqual([204, 51, 51, 255]);
    expect(pixel(1)).toEqual([128, 128, 128, 255]);
    expect(pixel(2)).toEqual([128, 128, 128, 255]);
  });

  it('makes the image again only for another slice', () => {
    const canvas = new PlanarSampledSliceCanvas(createTestVolume(), 4, 4);
    const first = slice(new Int16Array([1, 2]));

    expect(canvas.setSlice(first).changed).toBe(true);
    expect(canvas.setSlice(first).changed).toBe(false);
    expect(canvas.setSlice(slice(new Int16Array([1, 2]))).changed).toBe(true);
  });
});

describe('getSliceCanvasTransform', () => {
  const apply = (transform, [u, v]) => [
    transform[0] * u + transform[2] * v + transform[4],
    transform[1] * u + transform[3] * v + transform[5],
  ];

  it('puts each pixel centre where the world to canvas function puts its world position, for a rotated, flipped and zoomed camera', () => {
    const canvas = { width: 40, height: 30 };
    const camera = {
      focalPoint: [1, 2, 0],
      parallelScale: 7,
      viewPlaneNormal: [0, 0, -1],
      viewUp: [Math.sin(0.4), Math.cos(0.4), 0],
    };
    const slice = {
      origin: [-3, -2, 0],
      xDirection: [1, 0, 0],
      yDirection: [0, 1, 0],
      spacing: [0.5, 2],
      width: 12,
      height: 4,
    };
    const transform = getSliceCanvasTransform(slice, camera, canvas);

    [
      [0, 0],
      [11, 0],
      [0, 3],
      [7, 2],
    ].forEach(([column, row]) => {
      const world = [
        slice.origin[0] + column * slice.spacing[0],
        slice.origin[1] + row * slice.spacing[1],
        0,
      ];
      const expected = worldToCanvasPlanarViewState({
        camera,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        worldPos: world,
      });
      const actual = apply(transform, [column + 0.5, row + 0.5]);

      expect(actual[0]).toBeCloseTo(expected[0], 3);
      expect(actual[1]).toBeCloseTo(expected[1], 3);
    });
  });

  it('maps a slice of the screen grid to the canvas one to one', () => {
    const camera = {
      focalPoint: [10, -4, 7],
      parallelScale: 33,
      viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
      viewUp: [0, 1, 0],
    };
    const screen = getScreenSliceGeometry({
      camera,
      canvasWidth: 300,
      canvasHeight: 200,
    });

    expect(
      getSliceCanvasTransform(screen, camera, { width: 300, height: 200 })
    ).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe('PlanarSliceSampler for a draw step that enlarges colours', () => {
  it('samples a LINEAR straight cut on the screen grid at rest, a NEAREST one not', () => {
    const volume = createTestVolume();
    const camera = axialCamera(1);
    const screen = getScreenSliceGeometry({
      camera,
      canvasWidth: 8,
      canvasHeight: 8,
    });
    const colours = new PlanarSliceSampler({ enlargesColours: true });
    const values = new PlanarSliceSampler();
    const linear = { interpolationType: InterpolationType.LINEAR };
    const nearest = { interpolationType: InterpolationType.NEAREST };

    colours.sample(volume, camera, linear, screen);
    values.sample(volume, camera, linear, screen);

    expect(colours.sampleFiner(volume, camera, linear, screen)).toBeDefined();
    expect(values.sampleFiner(volume, camera, linear, screen)).toBeUndefined();

    colours.sample(volume, camera, nearest, screen);

    expect(
      colours.sampleFiner(volume, camera, nearest, screen)
    ).toBeUndefined();
  });
});
