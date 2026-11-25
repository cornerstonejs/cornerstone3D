jest.mock('../src/loaders/volumeLoader', () => ({
  __esModule: true,
  createAndCacheVolume: jest.fn(async (volumeId, { imageIds }) => ({
    volumeId,
    imageIds,
    load: jest.fn(),
  })),
}));

import { displaySetRegistry } from '@cornerstonejs/metadata';
import cache from '../src/cache/cache';
import { OrientationAxis } from '../src/enums';
import { createAndCacheVolume } from '../src/loaders/volumeLoader';
import { getDefaultVolumeId } from '../src/utilities/getDefaultVolumeId';
import { getVolumeOrImageDisplaySet } from '../src/RenderingEngine/Viewports/displaySetAccess';
import { PlanarRenderModeId } from '../src/RenderingEngine/Viewports/Planar/planarRenderModeIds';
import { PlanarRenderPathDecisionService } from '../src/RenderingEngine/Viewports/Planar/PlanarRenderPathDecisionService';
import { DefaultPlanarDataProvider } from '../src/RenderingEngine/Viewports/Planar/DefaultPlanarDataProvider';
import { DefaultVolume3DDataProvider } from '../src/RenderingEngine/Viewports/Volume3D/DefaultVolume3DDataProvider';

const imageIds = ['wadors:ct-0', 'wadors:ct-1', 'wadors:ct-2'];
const volumeImageIds = ['local:pmap-0', 'local:pmap-1'];
const cachedVolumes = new Map();

/** A volume in the cache with the fields that the decision reads. */
function cacheVolume(volumeId, ids = imageIds) {
  const volume = { volumeId, imageIds: ids, isDynamicVolume: () => false };

  cachedVolumes.set(volumeId, volume);

  return volume;
}

describe('the mode and the volume id of a planar mount', () => {
  let service;

  beforeEach(() => {
    service = new PlanarRenderPathDecisionService();
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) => cachedVolumes.get(volumeId));
    jest
      .spyOn(cache, 'getVolumeLoadObject')
      .mockImplementation((volumeId) =>
        cachedVolumes.has(volumeId) ? { promise: Promise.resolve() } : undefined
      );
  });

  afterEach(() => {
    cachedVolumes.clear();
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  it('takes the image path for a data set with a volumeId in the acquisition plane, as the mount asks for no mode', () => {
    cacheVolume('ct-volume');

    const dataSet = { imageIds, volumeId: 'ct-volume' };

    expect(
      service.select(dataSet, { orientation: OrientationAxis.ACQUISITION })
        .renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
    expect(
      service.select(dataSet, {
        orientation: OrientationAxis.ACQUISITION,
        mode: 'auto',
      }).renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
  });

  it('takes the path that the mode asks for in the acquisition plane', () => {
    cacheVolume('ct-volume');

    const dataSet = { imageIds, volumeId: 'ct-volume' };
    const acquisition = { orientation: OrientationAxis.ACQUISITION };

    expect(
      service.select(dataSet, { ...acquisition, mode: 'volume' }).renderMode
    ).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    expect(
      service.select(dataSet, { ...acquisition, mode: 'stack' }).renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
  });

  it('refuses a stack in another orientation than the acquisition plane, and a stack of a display set that names a volume only', () => {
    cacheVolume('ct-volume');

    const dataSet = { imageIds, volumeId: 'ct-volume' };
    const volumeOnly = { imageIds, volumeId: 'ct-volume', volumeOnly: true };

    expect(() =>
      service.select(dataSet, {
        orientation: OrientationAxis.SAGITTAL,
        mode: 'stack',
      })
    ).toThrow("mode 'stack' shows the images in their acquisition plane only");
    expect(
      service.canRender(dataSet, {
        orientation: OrientationAxis.SAGITTAL,
        mode: 'stack',
      })
    ).toBe(false);
    expect(() => service.select(volumeOnly, { mode: 'stack' })).toThrow(
      "mode 'stack' shows the image ids of a display set"
    );
    expect(service.canRender(volumeOnly, { mode: 'stack' })).toBe(false);
  });

  it('takes the volume path for a slab in the acquisition plane when the mount asks for no mode, and the image path without one or for mode stack', () => {
    jest
      .spyOn(require('../src/utilities/isValidVolume'), 'isValidVolume')
      .mockReturnValue(true);

    const dataSet = { imageIds };
    const acquisition = { orientation: OrientationAxis.ACQUISITION };

    expect(
      service.select(dataSet, { ...acquisition, slabThickness: 10 }).renderMode
    ).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    expect(service.select(dataSet, acquisition).renderMode).toBe(
      PlanarRenderModeId.VTK_FRAME
    );
    expect(
      service.select(dataSet, {
        ...acquisition,
        mode: 'stack',
        slabThickness: 10,
      }).renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
  });

  it('takes the image path for a slab when the images form no volume', () => {
    jest
      .spyOn(require('../src/utilities/isValidVolume'), 'isValidVolume')
      .mockReturnValue(false);

    expect(
      service.select(
        { imageIds },
        { orientation: OrientationAxis.ACQUISITION, slabThickness: 10 }
      ).renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
  });

  it('takes the volume path for a display set whose volume is a dynamic volume of the cache when the mount asks for no mode', () => {
    const dynamic = cacheVolume('pet-dynamic');

    dynamic.isDynamicVolume = () => true;
    cacheVolume('ct-static');

    const acquisition = { orientation: OrientationAxis.ACQUISITION };

    expect(
      service.select({ imageIds, volumeId: 'pet-dynamic' }, acquisition)
        .renderMode
    ).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    expect(
      service.select({ imageIds }, { ...acquisition, volumeId: 'pet-dynamic' })
        .renderMode
    ).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
    expect(
      service.select({ imageIds, volumeId: 'ct-static' }, acquisition)
        .renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
    expect(
      service.select(
        { imageIds, volumeId: 'pet-dynamic' },
        { ...acquisition, mode: 'stack' }
      ).renderMode
    ).toBe(PlanarRenderModeId.VTK_FRAME);
  });

  it('shows a display set that names a volume only as a volume when the mount asks for no mode', () => {
    cacheVolume('pmap-volume', volumeImageIds);

    expect(
      service.select({
        imageIds: volumeImageIds,
        volumeId: 'pmap-volume',
        volumeOnly: true,
      }).renderMode
    ).toBe(PlanarRenderModeId.VTK_GPU_VOLUME_SLICE);
  });

  it('takes the volume id of the mount, then of the data set, then the default id of the image ids, and the mount id only in volume mode', () => {
    cacheVolume('ct-volume');
    cacheVolume('ct-reduced');
    jest
      .spyOn(require('../src/utilities/isValidVolume'), 'isValidVolume')
      .mockReturnValue(true);

    const volume = { mode: 'volume' };

    expect(
      service.select(
        { imageIds, volumeId: 'ct-volume' },
        { ...volume, volumeId: 'ct-reduced' }
      ).volumeId
    ).toBe('ct-reduced');
    expect(
      service.select({ imageIds, volumeId: 'ct-volume' }, volume).volumeId
    ).toBe('ct-volume');
    expect(service.select({ imageIds }, volume).volumeId).toBe(
      getDefaultVolumeId(imageIds)
    );
    expect(
      service.select(
        { imageIds, volumeId: 'ct-volume' },
        { mode: 'stack', volumeId: 'ct-reduced' }
      ).volumeId
    ).toBe('ct-volume');
  });

  it('gives a given volume id the scheme of the streaming loader unless the cache holds it or the id names a scheme', () => {
    expect(
      service.select({ imageIds }, { mode: 'stack', volumeId: 'x' }).volumeId
    ).toBe(getDefaultVolumeId(imageIds));
    expect(
      service.select({ imageIds, volumeId: 'plain' }, { mode: 'stack' })
        .volumeId
    ).toBe('cornerstoneStreamingImageVolume:plain');
    expect(
      service.select(
        { imageIds, volumeId: 'nifti:https://host/ct.nii.gz' },
        { mode: 'stack' }
      ).volumeId
    ).toBe('nifti:https://host/ct.nii.gz');
  });
});

describe('the default volume id of image ids', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is the hash of the image ids with the streaming scheme, the same in any order', () => {
    expect(getDefaultVolumeId(imageIds)).toBe(
      `cornerstoneStreamingImageVolume:${cache.generateVolumeId(imageIds)}`
    );
    expect(getDefaultVolumeId([...imageIds].reverse())).toBe(
      getDefaultVolumeId(imageIds)
    );
  });

  it('is the bare hash when the cache holds the volume under it', () => {
    const bare = cache.generateVolumeId(imageIds);

    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) =>
        volumeId === bare ? { volumeId } : undefined
      );

    expect(getDefaultVolumeId(imageIds)).toBe(bare);
  });
});

describe('the volume of a 3D mount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(cache, 'getVolume').mockImplementation(() => undefined);
    jest
      .spyOn(cache, 'getVolumeLoadObject')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  it('takes the default id of the image ids, not the display set id, when nothing names a volume', async () => {
    displaySetRegistry.add('ct', { imageIds });

    const payload = await new DefaultVolume3DDataProvider().load('ct', {
      renderMode: 'vtkVolume3d',
    });

    expect(payload.volumeId).toBe(getDefaultVolumeId(imageIds));
    expect(createAndCacheVolume).toHaveBeenCalledWith(
      getDefaultVolumeId(imageIds),
      { imageIds }
    );
  });

  it('takes the volume id of the mount over the volume id of the display set', async () => {
    displaySetRegistry.add('ct', {
      imageIds,
      volumeId: 'cornerstoneStreamingImageVolume:ct',
    });

    const fromDisplaySet = await new DefaultVolume3DDataProvider().load('ct', {
      renderMode: 'vtkVolume3d',
    });
    const fromMount = await new DefaultVolume3DDataProvider().load('ct', {
      renderMode: 'vtkVolume3d',
      volumeId: 'cornerstoneStreamingImageVolume:reduced',
    });

    expect(fromDisplaySet.volumeId).toBe('cornerstoneStreamingImageVolume:ct');
    expect(fromMount.volumeId).toBe('cornerstoneStreamingImageVolume:reduced');
  });
});

describe('a display set that names a volume and no image ids', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cachedVolumes.clear();
    displaySetRegistry.clear();
    jest.restoreAllMocks();
  });

  it('takes the image ids of its volume when the cache holds it, and is no display set of image ids before', () => {
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) => cachedVolumes.get(volumeId));
    displaySetRegistry.add('pmap', { volumeId: 'nifti:pmap' });

    expect(getVolumeOrImageDisplaySet('pmap')).toBeUndefined();

    cacheVolume('nifti:pmap', volumeImageIds);

    expect(getVolumeOrImageDisplaySet('pmap')).toEqual({
      volumeId: 'nifti:pmap',
      imageIds: volumeImageIds,
      volumeOnly: true,
    });
  });

  it('gives the descriptor itself when it has image ids', () => {
    const descriptor = { imageIds, volumeId: 'ct-volume' };

    displaySetRegistry.add('ct', descriptor);

    expect(getVolumeOrImageDisplaySet('ct')).toBe(descriptor);
  });

  it('loads its volume in a planar viewport and in a 3D viewport', async () => {
    jest
      .spyOn(cache, 'getVolume')
      .mockImplementation((volumeId) => cachedVolumes.get(volumeId));
    cacheVolume('nifti:pmap', volumeImageIds);
    displaySetRegistry.add('pmap', { volumeId: 'nifti:pmap' });

    const planar = await new DefaultPlanarDataProvider().load('pmap', {
      orientation: OrientationAxis.ACQUISITION,
      renderMode: PlanarRenderModeId.VTK_GPU_VOLUME_SLICE,
      volumeId: 'nifti:pmap',
    });
    const volume3D = await new DefaultVolume3DDataProvider().load('pmap', {
      renderMode: 'vtkVolume3d',
    });

    expect(planar.volumeId).toBe('nifti:pmap');
    expect(planar.imageIds).toEqual(volumeImageIds);
    expect(volume3D.volumeId).toBe('nifti:pmap');
    expect(volume3D.imageIds).toEqual(volumeImageIds);
  });
});
