import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, OrientationAxis } from '../src/enums';
import { ActorRenderMode } from '../src/types';
import cache from '../src/cache/cache';
import { canRenderFloatTextures, setSliceFirst } from '../src/init';
import { getRenderingCapabilities } from '../src/utilities/renderingCapabilities';
import {
  PlanarRenderPathDecisionService,
  getGpuVolumePathLimit,
} from '../src/RenderingEngine/GenericViewport/Planar/PlanarRenderPathDecisionService';

jest.mock('../src/utilities/renderingCapabilities', () => ({
  ...jest.requireActual('../src/utilities/renderingCapabilities'),
  getRenderingCapabilities: jest.fn(),
}));

const PHONE = {
  webgl: true,
  floatLinear: false,
  norm16: true,
  norm16Linear: true,
};
const DESKTOP = { webgl: true, floatLinear: true };
const NO_WEBGL = { webgl: false, floatLinear: false };

/** A volume with the fields that the decision reads, of the given array type. */
function createVolume(volumeId, ArrayType) {
  const dimensions = [128, 128, 100];
  const spacing = [4, 4, 3];
  const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const imageData = vtkImageData.newInstance({
    spacing,
    origin: [0, 0, 0],
    direction,
  });

  imageData.setDimensions(dimensions);

  return {
    volumeId,
    imageIds: Array.from(
      { length: dimensions[2] },
      (_, i) => `${volumeId}:${i}`
    ),
    dimensions,
    spacing,
    direction,
    origin: [0, 0, 0],
    dataType: ArrayType.name,
    imageData,
    isDynamicVolume: () => false,
    voxelManager: {
      numberOfComponents: 1,
      getConstructor: () => ArrayType,
    },
  };
}

function setProfile(profile) {
  getRenderingCapabilities.mockReturnValue({
    maxTextureSize: 16384,
    renderer: 'test',
    softwareRasterizer: false,
    webglCanvasCopy: true,
    norm16: true,
    norm16Linear: true,
    float: true,
    halfFloat: true,
    halfFloatLinear: true,
    ...profile,
  });
}

describe('getGpuVolumePathLimit', () => {
  it('keeps a float layer off the GPU volume path on a device that cannot filter float textures', () => {
    expect(getGpuVolumePathLimit({ arrayType: 'Float32Array' }, PHONE)).toBe(
      'floatFilter'
    );
  });

  it('lets an integer layer go there on the same device', () => {
    ['Int16Array', 'Uint16Array', 'Uint8Array'].forEach((arrayType) => {
      expect(getGpuVolumePathLimit({ arrayType }, PHONE)).toBeUndefined();
    });
  });

  it('lets every layer go there on a device that filters float textures', () => {
    ['Float32Array', 'Int16Array'].forEach((arrayType) => {
      expect(getGpuVolumePathLimit({ arrayType }, DESKTOP)).toBeUndefined();
    });
  });

  it('does not limit the GPU path without a profile of a WebGL2 context', () => {
    expect(
      getGpuVolumePathLimit({ arrayType: 'Float32Array' }, NO_WEBGL)
    ).toBeUndefined();
  });
});

describe('slab routing of each layer of a fusion viewport', () => {
  const ct = createVolume('ct-volume', Int16Array);
  const pt = createVolume('pt-volume', Float32Array);
  const ctDataSet = { imageIds: ct.imageIds, volumeId: 'ct-volume' };
  const ptDataSet = { imageIds: pt.imageIds, volumeId: 'pt-volume' };
  const blendModes = [
    BlendModes.MAXIMUM_INTENSITY_BLEND,
    BlendModes.MINIMUM_INTENSITY_BLEND,
    BlendModes.AVERAGE_INTENSITY_BLEND,
  ];
  let service;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((id) => ({ 'ct-volume': ct, 'pt-volume': pt })[id]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    getRenderingCapabilities.mockReset();
  });

  function modeOf(dataSet, options) {
    return service.select(dataSet, {
      orientation: OrientationAxis.CORONAL,
      ...options,
    }).renderMode;
  }

  it('samples the slab of the float layer on the CPU and draws the slab of the integer layer on the GPU', () => {
    setProfile(PHONE);

    blendModes.forEach((blendMode) => {
      [10, 40, 300].forEach((slabThickness) => {
        const options = { sliceFirst: true, blendMode, slabThickness };

        expect(modeOf(ptDataSet, options)).toBe(
          ActorRenderMode.VTK_SAMPLED_SLICE
        );
        expect(modeOf(ctDataSet, options)).toBe(
          ActorRenderMode.VTK_VOLUME_SLICE
        );
      });
    });
  });

  it('samples a plain slice of both layers', () => {
    setProfile(PHONE);

    [ctDataSet, ptDataSet].forEach((dataSet) => {
      expect(modeOf(dataSet, { sliceFirst: true, slabThickness: 0 })).toBe(
        ActorRenderMode.VTK_SAMPLED_SLICE
      );
    });
  });

  it('draws the slab of both layers on the GPU on a device that filters float textures', () => {
    setProfile(DESKTOP);

    [ctDataSet, ptDataSet].forEach((dataSet) => {
      expect(
        modeOf(dataSet, {
          sliceFirst: true,
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
          slabThickness: 10,
        })
      ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
    });
  });

  it('does not change anything with slice first off', () => {
    setProfile(PHONE);

    [ctDataSet, ptDataSet].forEach((dataSet) => {
      [0, 10].forEach((slabThickness) => {
        expect(
          modeOf(dataSet, {
            sliceFirst: false,
            blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
            slabThickness,
          })
        ).toBe(ActorRenderMode.VTK_VOLUME_SLICE);
      });
    });
  });

  it('does not change the CPU backend', () => {
    setProfile(PHONE);

    expect(
      modeOf(ptDataSet, {
        renderBackend: 'cpu',
        sliceFirst: true,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: 10,
      })
    ).toBe(ActorRenderMode.CPU_VOLUME);
  });
});

describe('canRenderFloatTextures', () => {
  afterEach(() => {
    setSliceFirst(false);
    getRenderingCapabilities.mockReset();
  });

  it('is true on a device that filters float textures, whatever slice first is', () => {
    setProfile(DESKTOP);

    expect(canRenderFloatTextures()).toBe(true);
    setSliceFirst(true);
    expect(canRenderFloatTextures()).toBe(true);
  });

  it('follows slice first on a device that cannot filter float textures', () => {
    setProfile(PHONE);

    expect(canRenderFloatTextures()).toBe(false);
    setSliceFirst(true);
    expect(canRenderFloatTextures()).toBe(true);
    setSliceFirst(false);
    expect(canRenderFloatTextures()).toBe(false);
  });
});
