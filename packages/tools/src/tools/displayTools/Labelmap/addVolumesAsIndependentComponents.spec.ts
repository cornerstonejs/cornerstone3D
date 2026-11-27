jest.mock('@cornerstonejs/core', () => ({
  cache: { getVolume: jest.fn(), getImage: jest.fn() },
  Enums: { BlendModes: { LABELMAP_EDGE_PROJECTION_BLEND: 0 } },
  // The real one, so the tests below see what it does to the image data.
  convertMapperToNotSharedMapper: jest.requireActual('@cornerstonejs/core')
    .convertMapperToNotSharedMapper,
  volumeLoader: { loadVolume: jest.fn() },
  eventTarget: {
    addEventListener: jest.fn(),
    addEventListenerDebounced: jest.fn(),
    removeEventListener: jest.fn(),
    removeEventListenerDebounced: jest.fn(),
  },
}));
jest.mock('../../../stateManagement/segmentation/getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { cache, eventTarget, volumeLoader } from '@cornerstonejs/core';
import { Events } from '../../../enums';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { addVolumesAsIndependentComponents } from './addVolumesAsIndependentComponents';

const dimensions = [4, 3, 2];
const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

/**
 * A viewport that draws a loaded base volume through a mapper that reads the
 * volume's image data, as every viewport of the volume does, and a labelmap
 * volume on the same grid.
 */
function loadedVolumeViewport(uid: string) {
  const baseValues = Float32Array.from({ length: voxelCount }, (_, i) => i);
  const baseImageData = vtkImageData.newInstance();
  baseImageData.setDimensions(dimensions);
  const baseVoxelManager = {
    getCompleteScalarDataArray: () => baseValues,
    getScalarDataLength: () => voxelCount,
  };
  baseImageData.set(
    { voxelManager: baseVoxelManager, numberOfComponents: 1 },
    true
  );
  const baseVolume = {
    volumeId: 'ct',
    imageData: baseImageData,
    voxelManager: baseVoxelManager,
  };

  const labels = new Uint8Array(voxelCount);
  const segVolume = {
    volumeId: 'seg',
    imageData: { getDimensions: () => dimensions },
    voxelManager: {
      getCompleteScalarDataArray: () => labels,
      getAtIndex: (index: number) => labels[index],
    },
  };

  (cache.getVolume as jest.Mock).mockImplementation((id) =>
    id === 'ct' ? baseVolume : segVolume
  );
  (volumeLoader.loadVolume as jest.Mock).mockResolvedValue(segVolume);
  (getSegmentation as jest.Mock).mockReturnValue({
    representationData: { Labelmap: { volumeId: 'seg' } },
  });

  const sharedMapper = vtkVolumeMapper.newInstance();
  sharedMapper.setInputData(baseImageData);
  const actor = vtkVolume.newInstance();
  actor.setMapper(sharedMapper);

  const viewport = {
    id: 'mip',
    isDisabled: false,
    getDefaultActor: () => ({ uid, actor }),
    getVolumeId: () => 'ct',
    getBlendMode: () => 0,
    getActor: jest.fn(),
    removeActors: jest.fn(),
    addActor: jest.fn(),
    render: jest.fn(),
  };

  const add = () =>
    addVolumesAsIndependentComponents({
      viewport: viewport as never,
      volumeInputs: [{ volumeId: 'seg' }],
      segmentationId: 'seg-1',
    });

  return { add, actor, sharedMapper, baseImageData, labels };
}

/** The last listener that the function added for an event. */
function lastListener(add: unknown, type: string) {
  return (add as jest.Mock).mock.calls
    .filter(([name]) => name === type)
    .pop()[1];
}

describe('addVolumesAsIndependentComponents', () => {
  it('keeps the base actor while the base volume loads', async () => {
    // The combined array copies the base voxels once, so a frame that loads
    // later would stay empty in it. A reduced base volume names no
    // full-resolution texture, so only the load state can tell this.
    const baseVolume = {
      volumeId: 'ct',
      loadStatus: { loading: true },
      vtkOpenGLTexture: undefined,
      voxelManager: { getCompleteScalarDataArray: jest.fn() },
    };
    const segVolume = {
      volumeId: 'seg',
      imageData: { getDimensions: () => [1, 1, 1] },
      voxelManager: { getCompleteScalarDataArray: () => new Uint8Array(1) },
    };
    (cache.getVolume as jest.Mock).mockImplementation((id) =>
      id === 'ct' ? baseVolume : segVolume
    );
    (volumeLoader.loadVolume as jest.Mock).mockResolvedValue(segVolume);
    const viewport = {
      getDefaultActor: () => ({ uid: 'ct', actor: {} }),
      getVolumeId: () => 'ct',
      removeActors: jest.fn(),
      addActor: jest.fn(),
    };

    await addVolumesAsIndependentComponents({
      viewport: viewport as never,
      volumeInputs: [{ volumeId: 'seg' }],
      segmentationId: 'seg-1',
    });

    expect(viewport.removeActors).not.toHaveBeenCalled();
    expect(viewport.addActor).not.toHaveBeenCalled();
    expect(
      baseVolume.voxelManager.getCompleteScalarDataArray
    ).not.toHaveBeenCalled();
  });

  // The other viewports of the base volume render from its image data. Scalars
  // on it, or a new modified time, make each of them build its texture again.
  it('keeps the combined array off the image data of the base volume', async () => {
    const { add, actor, sharedMapper, baseImageData, labels } =
      loadedVolumeViewport('ct-own-image-data');
    // vtk.js warns when the function sets preLoad on the actor.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const basePointData = baseImageData.getPointData();
    const modifiedTime = baseImageData.getMTime();
    const expectBaseAsItWas = () => {
      expect(sharedMapper.getInputData()).toBe(baseImageData);
      expect(basePointData.getNumberOfArrays()).toBe(0);
      expect(baseImageData.getMTime()).toBe(modifiedTime);
    };

    labels[5] = 1;
    await add();

    const mapper = actor.getMapper();
    const combined = mapper.getInputData().getPointData().getScalars();
    expect(mapper).not.toBe(sharedMapper);
    expect(combined.getNumberOfComponents()).toBe(2);
    expect(Array.from(combined.getData().slice(8, 12))).toEqual([4, 0, 5, 1]);
    expectBaseAsItWas();

    // An edit of the labelmap goes to the second component.
    labels[4] = 2;
    lastListener(
      eventTarget.addEventListenerDebounced,
      Events.SEGMENTATION_DATA_MODIFIED
    )({ detail: { segmentationId: 'seg-1' } });

    expect(Array.from(combined.getData().slice(8, 12))).toEqual([4, 2, 5, 1]);
    expectBaseAsItWas();

    // Removing the representation gives the actor its mapper back.
    lastListener(
      eventTarget.addEventListener,
      Events.SEGMENTATION_REPRESENTATION_REMOVED
    )({ detail: { viewportId: 'mip' } });

    expect(actor.getMapper()).toBe(sharedMapper);
    expectBaseAsItWas();

    // And it can be added again.
    await add();

    expect(actor.getMapper()).not.toBe(sharedMapper);
    expect(actor.getMapper()).not.toBe(mapper);
    expectBaseAsItWas();

    warn.mockRestore();
  });
});
