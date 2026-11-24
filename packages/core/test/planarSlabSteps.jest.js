import { describe, it, expect, jest, afterEach } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, InterpolationType } from '../src/enums';
import VoxelManager from '../src/utilities/VoxelManager';
import * as sampleVolumeSliceModule from '../src/utilities/sampleVolumeSlice';
import {
  MAX_SLAB_SAMPLES_AT_ONCE,
  PlanarSliceSampler,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSlice';
import {
  VtkSampledSliceRenderPath,
  reportSamplingState,
} from '../src/RenderingEngine/Viewports/Planar/VtkSampledSliceRenderPath';
import {
  SAMPLED_SLICE_REST_DELAY_MS,
  scheduleSampledSliceRestWork,
} from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceRest';

const DIMENSIONS = [128, 96, 60];

/** A volume of real voxels with values that change from voxel to voxel. */
function createVolume(ArrayType = Int16Array) {
  const [columns, rows, slices] = DIMENSIONS;
  const scalarData = new ArrayType(columns * rows * slices);
  let seed = 7;

  for (let index = 0; index < scalarData.length; index++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    scalarData[index] =
      ArrayType === Float32Array ? (seed % 100000) / 977 : seed % 3000;
  }

  const imageData = vtkImageData.newInstance({
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  });

  imageData.setDimensions(DIMENSIONS);

  return {
    volumeId: 'steps-volume',
    imageData,
    dimensions: DIMENSIONS,
    spacing: [1, 1, 1],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    origin: [0, 0, 0],
    dataType: ArrayType.name,
    isDynamicVolume: () => false,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions: DIMENSIONS,
      scalarData,
    }),
  };
}

const CAMERAS = {
  axial: {
    focalPoint: [63.5, 47.5, 30.2],
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
  },
  coronal: {
    focalPoint: [63.5, 47.3, 29.5],
    viewPlaneNormal: [0, 1, 0],
    viewUp: [0, 0, 1],
  },
  oblique: {
    focalPoint: [63.5, 47.5, 29.5],
    viewPlaneNormal: [0, Math.sin(0.3), Math.cos(0.3)],
    viewUp: [0, Math.cos(0.3), -Math.sin(0.3)],
  },
};

function slabInputs(blendMode, interpolationType, thickness = 20) {
  return { interpolationType, slab: { thickness, blendMode } };
}

/** Runs the steps one band at a time and counts them. */
function finishSteps(sampler, volume) {
  let steps = 0;
  let slice;

  while (sampler.hasPendingSteps()) {
    slice = sampler.continueSampling(volume, -Infinity) ?? slice;
    steps++;
  }

  return { slice, steps };
}

describe('a slab sampled in steps', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const cases = [];

  [Int16Array, Float32Array].forEach((ArrayType) => {
    Object.keys(CAMERAS).forEach((view) => {
      [InterpolationType.NEAREST, InterpolationType.LINEAR].forEach(
        (interpolationType) => {
          [
            BlendModes.MAXIMUM_INTENSITY_BLEND,
            BlendModes.MINIMUM_INTENSITY_BLEND,
            BlendModes.AVERAGE_INTENSITY_BLEND,
          ].forEach((blendMode) => {
            cases.push([ArrayType.name, view, interpolationType, blendMode]);
          });
        }
      );
    });
  });

  it.each(cases)(
    'gives the same slab as one sample (%s, %s, interpolation %s, blend %s)',
    (arrayType, view, interpolationType, blendMode) => {
      const volume = createVolume(
        arrayType === 'Float32Array' ? Float32Array : Int16Array
      );
      const inputs = slabInputs(blendMode, interpolationType);
      const oneShot = new PlanarSliceSampler().sample(
        volume,
        CAMERAS[view],
        inputs
      );
      const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
      const thin = sampler.sample(volume, CAMERAS[view], inputs);

      expect(oneShot.width * oneShot.height * 41).toBeGreaterThan(
        MAX_SLAB_SAMPLES_AT_ONCE
      );
      expect(thin.sampledFor.slab).toBeUndefined();
      expect(sampler.hasPendingSteps()).toBe(true);

      const { slice, steps } = finishSteps(sampler, volume);

      expect(steps).toBeGreaterThan(1);
      expect(slice.sampledFor.slab).toEqual(inputs.slab);
      expect(slice.pixelData.constructor).toBe(oneShot.pixelData.constructor);
      expect(Array.from(slice.pixelData)).toEqual(
        Array.from(oneShot.pixelData)
      );
      expect([slice.min, slice.max]).toEqual([oneShot.min, oneShot.max]);
    }
  );

  it('shows the plain slice of the plane at once, sampled without a slab', () => {
    const volume = createVolume();
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const inputs = slabInputs(
      BlendModes.MAXIMUM_INTENSITY_BLEND,
      InterpolationType.LINEAR
    );
    const plain = new PlanarSliceSampler().sample(volume, CAMERAS.axial, {
      interpolationType: InterpolationType.LINEAR,
    });

    spy.mockClear();

    const thin = sampler.sample(volume, CAMERAS.axial, inputs);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].slab).toBeUndefined();
    expect(Array.from(thin.pixelData)).toEqual(Array.from(plain.pixelData));
  });

  it('scrolls through a thick slab with one plain sample per step and keeps only the steps of the last plane', () => {
    const volume = createVolume();
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const inputs = slabInputs(
      BlendModes.MAXIMUM_INTENSITY_BLEND,
      InterpolationType.NEAREST
    );

    for (let z = 20; z < 30; z++) {
      spy.mockClear();
      sampler.sample(
        volume,
        { ...CAMERAS.axial, focalPoint: [63.5, 47.5, z] },
        inputs
      );
      sampler.continueSampling(volume, -Infinity);

      expect(spy.mock.calls.filter(([options]) => !options.slab).length).toBe(
        1
      );
      expect(
        spy.mock.calls.filter(([options]) => options.slab).length
      ).toBeLessThanOrEqual(1);
    }

    const { slice } = finishSteps(sampler, volume);
    const last = new PlanarSliceSampler().sample(
      volume,
      { ...CAMERAS.axial, focalPoint: [63.5, 47.5, 29] },
      inputs
    );

    expect(Array.from(slice.pixelData)).toEqual(Array.from(last.pixelData));
  });

  it('cancels the steps when the presentation changes the inputs', () => {
    const volume = createVolume();
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const mip = slabInputs(
      BlendModes.MAXIMUM_INTENSITY_BLEND,
      InterpolationType.NEAREST
    );
    const minip = slabInputs(
      BlendModes.MINIMUM_INTENSITY_BLEND,
      InterpolationType.NEAREST
    );

    sampler.sample(volume, CAMERAS.axial, mip);
    sampler.continueSampling(volume, -Infinity);
    sampler.sample(volume, CAMERAS.axial, minip);

    const { slice } = finishSteps(sampler, volume);

    expect(slice.sampledFor.slab.blendMode).toBe(
      BlendModes.MINIMUM_INTENSITY_BLEND
    );
  });

  it('keeps the finished slab, so a return to the view samples nothing', () => {
    const volume = createVolume();
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const inputs = slabInputs(
      BlendModes.AVERAGE_INTENSITY_BLEND,
      InterpolationType.LINEAR
    );

    sampler.sample(volume, CAMERAS.coronal, inputs);

    const { slice } = finishSteps(sampler, volume);
    const spy = jest.spyOn(sampleVolumeSliceModule, 'sampleVolumeSlice');

    expect(sampler.sample(volume, CAMERAS.coronal, inputs)).toBe(slice);
    expect(sampler.hasPendingSteps()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('says a slab is too large and samples none of it', () => {
    const volume = createVolume();
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const thin = sampler.sample(
      volume,
      CAMERAS.axial,
      slabInputs(
        BlendModes.MAXIMUM_INTENSITY_BLEND,
        InterpolationType.NEAREST,
        20000
      )
    );

    expect(thin.sampledFor.slab).toBeUndefined();
    expect(sampler.hasPendingSteps()).toBe(false);
    expect(sampler.isSlabTooLarge()).toBe(true);

    sampler.sample(volume, CAMERAS.axial, {
      interpolationType: InterpolationType.NEAREST,
    });

    expect(sampler.isSlabTooLarge()).toBe(false);
  });

  it('samples every slab at once without the option, as before', () => {
    const volume = createVolume();
    const sampler = new PlanarSliceSampler();
    const slice = sampler.sample(
      volume,
      CAMERAS.axial,
      slabInputs(BlendModes.MAXIMUM_INTENSITY_BLEND, InterpolationType.NEAREST)
    );

    expect(slice.sampledFor.slab).toBeDefined();
    expect(sampler.hasPendingSteps()).toBe(false);
  });

  it('runs the steps at rest a frame at a time, draws the slab, and stops on cancel', () => {
    jest.useFakeTimers();

    const volume = createVolume();
    const sampler = new PlanarSliceSampler({ sampleSlabsInSteps: true });
    const inputs = slabInputs(
      BlendModes.AVERAGE_INTENSITY_BLEND,
      InterpolationType.NEAREST
    );
    const drawn = [];
    const start = () =>
      scheduleSampledSliceRestWork({
        sampler,
        volume,
        getCamera: () => CAMERAS.axial,
        getInputs: () => inputs,
        getScreen: () => undefined,
        getNeighbours: () => [],
        onFinerSlice: (slice) => drawn.push(slice),
      });
    const continueSampling = sampler.continueSampling.bind(sampler);
    const steps = jest
      .spyOn(sampler, 'continueSampling')
      .mockImplementation((stepVolume) =>
        continueSampling(stepVolume, -Infinity)
      );

    sampler.sample(volume, CAMERAS.axial, inputs);

    const cancel = start();

    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS);
    jest.advanceTimersByTime(16);

    expect(steps).toHaveBeenCalledTimes(1);

    cancel();
    jest.advanceTimersByTime(1000);

    expect(steps).toHaveBeenCalledTimes(1);
    expect(drawn).toEqual([]);

    start();
    jest.advanceTimersByTime(SAMPLED_SLICE_REST_DELAY_MS + 5000);

    expect(drawn.length).toBe(1);
    expect(drawn[0].sampledFor.slab).toEqual(inputs.slab);
    expect(sampler.hasPendingSteps()).toBe(false);
  });
});

describe('the sampled slice render path', () => {
  it('refuses a volume of several components per voxel', async () => {
    const ctx = { vtk: { renderer: { addActor: jest.fn() } } };

    await expect(
      new VtkSampledSliceRenderPath().addData(
        ctx,
        {
          id: 'rgb',
          imageVolume: { voxelManager: { numberOfComponents: 3 } },
          imageIds: [],
        },
        {}
      )
    ).rejects.toThrow('one value per voxel');
    expect(ctx.vtk.renderer.addActor).not.toHaveBeenCalled();
  });
});

describe('reportSamplingState', () => {
  it('says whether the state changed, so that the work at rest renders only then', () => {
    let slabTooLarge = false;
    const refreshRenderPlan = jest.fn();
    const mount = {
      displaySetId: 'ct',
      sampler: { isSlabTooLarge: () => slabTooLarge },
      ctx: { viewport: { refreshRenderPlan } },
      rendering: {},
    };

    expect(reportSamplingState(mount)).toBe(false);
    expect(refreshRenderPlan).not.toHaveBeenCalled();

    slabTooLarge = true;

    expect(reportSamplingState(mount)).toBe(true);
    expect(refreshRenderPlan).toHaveBeenCalledWith('ct');
    expect(reportSamplingState(mount)).toBe(false);
  });
});
