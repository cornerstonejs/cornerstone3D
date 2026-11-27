import { describe, it, expect, jest, afterEach } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, InterpolationType } from '../src/enums';
import VoxelManager from '../src/utilities/VoxelManager';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import * as renderingCapabilities from '../src/utilities/renderingCapabilities';
import {
  MAX_CPU_SLAB_SAMPLES,
  MAX_PREVIEW_SLAB_SAMPLES,
  PlanarSliceSampler,
} from '../src/RenderingEngine/Viewports/Planar/planarCpuSlice';
import { isGpuVolumePathClosed } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import { getVolumeSliceGeometry } from '../src/utilities/volumeSliceGeometry';

/** The voxel-size geometry that a sampler cuts for a linear request. */
function getGeometry(volume, camera) {
  return getVolumeSliceGeometry(volume, camera, {
    snapToSlice: false,
    maxSize: 2048,
  });
}

const SPACING = [1, 1, 0.3];
const BACKGROUND = 100;
const BRIGHT = 3000;

/**
 * A CT-like volume deeper than a 3D texture of 2048: `slices` slices of
 * `columns` x `rows` voxels of 1 mm, 0.3 mm apart, of a low background with
 * small changes (or the values of `value` by voxel index), and one bright
 * voxel at `bright` (i, j, k).
 */
function createDeepVolume({
  columns = 64,
  rows = 64,
  slices = 2500,
  bright = [40, 32, 1250],
  value = (index) => BACKGROUND + (index % 7),
} = {}) {
  const dimensions = [columns, rows, slices];
  const scalarData = new Int16Array(columns * rows * slices);

  for (let index = 0; index < scalarData.length; index++) {
    scalarData[index] = value(index);
  }

  if (bright) {
    scalarData[bright[0] + bright[1] * columns + bright[2] * columns * rows] =
      BRIGHT;
  }

  const imageData = vtkImageData.newInstance({
    spacing: SPACING,
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  });

  imageData.setDimensions(dimensions);

  return {
    volumeId: `deep-volume-${columns}-${rows}-${slices}`,
    imageData,
    dimensions,
    spacing: SPACING,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    origin: [0, 0, 0],
    dataType: 'Int16Array',
    isDynamicVolume: () => false,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData,
    }),
  };
}

/** A sagittal camera on the plane of voxel column `i`. */
function sagittalCamera(i, volume) {
  const [, rows, slices] = volume.dimensions;

  return {
    focalPoint: [i, (rows - 1) / 2, ((slices - 1) * SPACING[2]) / 2],
    viewPlaneNormal: [1, 0, 0],
    viewUp: [0, 0, 1],
  };
}

function mipInputs(thickness, stepSlabByVoxels) {
  return {
    interpolationType: InterpolationType.LINEAR,
    slab: { thickness, blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND },
    stepSlabByVoxels,
  };
}

/** Runs the steps of a sampler to the end and gives the last slab. */
function finishSteps(sampler, volume) {
  let slice;

  while (sampler.hasPendingSteps()) {
    slice = sampler.continueSampling(volume, Infinity) ?? slice;
  }

  return slice;
}

/** The voxel samples of every call of sampleVolumeSlice that a spy saw. */
function countSamples(spy) {
  return spy.mock.calls.reduce(
    (total, [options]) =>
      total + sampleVolumeSliceModule.getVolumeSliceSampleCount(options),
    0
  );
}

function maxOf(pixelData) {
  return pixelData.reduce((max, value) => Math.max(max, value), -Infinity);
}

describe('the slab of a volume too deep for a 3D texture', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is a layer that the GPU volume path cannot draw on a device whose largest 3D texture is 2048', () => {
    jest
      .spyOn(renderingCapabilities, 'getRenderingCapabilities')
      .mockReturnValue({
        webgl: true,
        floatLinear: true,
        max3DTextureSize: 2048,
        norm16: true,
        norm16Linear: true,
      });

    expect(isGpuVolumePathClosed(createDeepVolume())).toBe(true);
    expect(
      isGpuVolumePathClosed(createDeepVolume({ slices: 2000, bright: null }))
    ).toBe(false);
  });

  it.each([30, 60])(
    'shows a %s mm maximum of a sagittal plane as a slab from the first picture on, with the brightest voxel of the slab',
    (thickness) => {
      const volume = createDeepVolume();
      const camera = sagittalCamera(32, volume);
      const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
      const thin = new PlanarSliceSampler().sample(volume, camera, {
        interpolationType: InterpolationType.LINEAR,
      });
      const first = sampler.sample(volume, camera, mipInputs(thickness, true));

      expect(first.sampledFor.slab).toEqual(mipInputs(thickness).slab);
      expect(first.coarse).toBe(true);
      expect(first.width * first.height).toBeLessThan(thin.width * thin.height);
      expect(sampler.hasPendingSteps()).toBe(true);
      expect(sampler.isSlabTooLarge()).toBe(false);

      const slab = finishSteps(sampler, volume) ?? first;

      expect(slab.coarse).toBeUndefined();
      expect(maxOf(slab.pixelData)).toBe(BRIGHT);
      expect(slab.pixelData).not.toEqual(thin.pixelData);
    }
  );

  it('shows a coarse slab within the limit for a slab over it, says it is too large, and never shows the plain slice', () => {
    const volume = createDeepVolume({
      columns: 128,
      rows: 64,
      slices: 1600,
      bright: [70, 32, 800],
    });

    volume.spacing = [1, 1, 0.025];
    volume.imageData.setSpacing(volume.spacing);

    const camera = {
      focalPoint: [64, 31.5, 20],
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, 0, 1],
    };
    const inputs = mipInputs(200, false);
    const exact = sampleVolumeSliceModule.getVolumeSliceSampleCount({
      volume,
      geometry: { ...getGeometry(volume, camera), sliceIndex: 0 },
      slab: inputs.slab,
    });
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const first = sampler.sample(volume, camera, inputs);

    expect(exact).toBeGreaterThan(MAX_CPU_SLAB_SAMPLES);
    expect(first.coarse).toBe(true);
    expect(first.sampledFor.slab).toEqual(inputs.slab);
    expect(countSamples(spy)).toBeLessThanOrEqual(MAX_PREVIEW_SLAB_SAMPLES);
    expect(sampler.isSlabTooLarge()).toBe(true);

    spy.mockClear();

    const slab = finishSteps(sampler, volume);

    expect(slab.coarse).toBe(true);
    expect(slab.sampledFor.slab).toEqual(inputs.slab);
    expect(countSamples(spy)).toBeLessThanOrEqual(MAX_CPU_SLAB_SAMPLES);
    expect(maxOf(slab.pixelData)).toBe(BRIGHT);
    expect(sampler.isSlabTooLarge()).toBe(true);
    expect(sampler.sample(volume, camera, inputs)).toBe(slab);

    sampler.sample(volume, camera, {
      interpolationType: InterpolationType.LINEAR,
    });

    expect(sampler.isSlabTooLarge()).toBe(false);
  });

  it.each([
    [InterpolationType.LINEAR, BlendModes.MAXIMUM_INTENSITY_BLEND],
    [InterpolationType.LINEAR, BlendModes.MINIMUM_INTENSITY_BLEND],
    [InterpolationType.NEAREST, BlendModes.MAXIMUM_INTENSITY_BLEND],
    [InterpolationType.NEAREST, BlendModes.MINIMUM_INTENSITY_BLEND],
  ])(
    'with one sample per voxel along an axis gives the maximum and the minimum of the GPU sample positions for nearest samples, and keeps the voxel peaks they miss between two voxels for linear ones (interpolation %s, blend %s)',
    (interpolationType, blendMode) => {
      let seed = 11;
      const volume = createDeepVolume({
        slices: 400,
        bright: null,
        value: () => {
          seed = (seed * 1103515245 + 12345) % 2147483648;

          return seed % 3000;
        },
      });

      const geometry = {
        ...getGeometry(volume, sagittalCamera(32, volume)),
        sliceIndex: 0,
      };

      [3, 5, 10, 20].forEach((thickness) => {
        const slab = { thickness, blendMode };
        const mapper = sampleVolumeSliceModule.sampleVolumeSlice({
          volume,
          geometry,
          interpolationType,
          slab,
        });
        const byVoxels = sampleVolumeSliceModule.sampleVolumeSlice({
          volume,
          geometry,
          interpolationType,
          slab: { ...slab, sampleSpacing: SPACING[0] },
        });

        const sign = blendMode === BlendModes.MAXIMUM_INTENSITY_BLEND ? 1 : -1;

        if (interpolationType === InterpolationType.NEAREST) {
          expect(Array.from(byVoxels.pixelData)).toEqual(
            Array.from(mapper.pixelData)
          );
        } else {
          expect(
            Array.from(byVoxels.pixelData).every(
              (value, index) => sign * (value - mapper.pixelData[index]) >= 0
            )
          ).toBe(true);
          expect(
            Array.from(byVoxels.pixelData).some(
              (value, index) => value !== mapper.pixelData[index]
            )
          ).toBe(true);
        }
      });
    }
  );

  it('takes fewer samples by the spacing ratio for a 20 mm sagittal slab', () => {
    const volume = createDeepVolume({ bright: null });
    const camera = sagittalCamera(32, volume);
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');
    const count = (stepSlabByVoxels) => {
      spy.mockClear();
      new PlanarSliceSampler().sample(
        volume,
        camera,
        mipInputs(20, stepSlabByVoxels)
      );

      return countSamples(spy);
    };
    const mapper = count(false);
    const byVoxels = count(true);
    const spacingRatio = SPACING[0] / SPACING[2];

    expect(mapper / byVoxels).toBeGreaterThan(0.9 * spacingRatio);
    expect(mapper / byVoxels).toBeLessThan(1.1 * spacingRatio);
  });
});
