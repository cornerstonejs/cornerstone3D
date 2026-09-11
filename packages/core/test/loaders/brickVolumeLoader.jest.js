import { brickVolumeLoader } from '../../src/loaders/brickVolumeLoader';
import {
  parseBrickVolumeId,
  toBrickVolumeId,
} from '../../src/loaders/brick/brickMetadata';
import { Events, MetadataModules } from '../../src/enums';
import eventTarget from '../../src/eventTarget';
import cache from '../../src/cache/cache';
import * as metaData from '../../src/metaData';
import { getDefaultVolumeVOIRange } from '../../src/RenderingEngine/helpers/setDefaultVolumeVOI';
import { setBrickVolumeDisplayedPlanes } from '../../src/loaders/brick/brickVolume';
import { buildBrickStoreFixture } from './brickStoreFixture';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('brick volume id', () => {
  it('round-trips a store root, keeping the embedded scheme intact', () => {
    const url = 'https://host/studies/1/series/2/brick/';

    expect(parseBrickVolumeId(toBrickVolumeId(url))).toBe(url);
  });

  it('rejects an id for a different scheme', () => {
    expect(() => parseBrickVolumeId('nifti:https://host/a.nii')).toThrow(
      /must start with "brick:"/
    );
  });
});

describe('brickVolumeLoader', () => {
  let fixture;
  let volumeId;
  let counter = 0;

  beforeEach(() => {
    // Unique store root per test, so cached per-slice image ids never collide.
    fixture = buildBrickStoreFixture({
      baseUrl: `https://host/series/${counter++}/brick/`,
    });
    volumeId = toBrickVolumeId(fixture.baseUrl);
  });

  afterEach(() => {
    cache.purgeCache();
  });

  const load = (options = {}) =>
    brickVolumeLoader(volumeId, {
      fetchBrick: fixture.fetchBrick,
      decodeBrick: fixture.decodeBrick,
      manifest: fixture.manifest,
      ...options,
    });

  it('requires an injected decoder', () => {
    expect(() => brickVolumeLoader(volumeId, {})).toThrow(/decodeBrick/);
  });

  it('allocates at full extent and fills from the coarse level', async () => {
    const { promise } = load({ coarseLevel: 'd2' });
    const volume = await promise;

    // Full extent, not the coarse level's — refinement needs somewhere to land.
    expect(volume.dimensions).toEqual([16, 16, 16]);
    expect(volume.spacing).toEqual([1, 1, 1]);

    // Only d2 bricks were fetched.
    expect(fixture.brickRequests().every((u) => u.includes('/d2/'))).toBe(true);
  });

  it('upsamples the coarse level so every voxel is populated', async () => {
    const { promise } = load({ coarseLevel: 'd2' });
    const volume = await promise;

    const data = volume.voxelManager.getCompleteScalarDataArray();
    const coarse = fixture.levelData.get('d2');

    expect(data).toHaveLength(16 * 16 * 16);
    expect(data.some((v) => v !== 0)).toBe(true);

    // Each destination voxel carries its coarse parent's value.
    for (const [x, y, z] of [
      [0, 0, 0],
      [3, 5, 9],
      [15, 15, 15],
    ]) {
      const expected =
        coarse.data[
          (x >> 1) +
            (y >> 1) * coarse.dimensions[0] +
            (z >> 1) * coarse.dimensions[0] * coarse.dimensions[1]
        ];

      expect(data[x + y * 16 + z * 256]).toBe(expected);
    }
  });

  it('reproduces the source exactly once refined to full resolution', async () => {
    const { promise } = load({ coarseLevel: 'd2', refineToLevel: 'd1' });
    const volume = await promise;

    // Refinement runs behind the resolved promise; wait for completion.
    await new Promise((resolve) => {
      eventTarget.addEventListener(
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
        resolve,
        { once: true }
      );
    });

    const data = volume.voxelManager.getCompleteScalarDataArray();

    expect(Array.from(data)).toEqual(Array.from(fixture.source));
  });

  it('allocates at the coarse extent when reducedExtent is set', async () => {
    const { promise } = load({ coarseLevel: 'd2', reducedExtent: true });
    const volume = await promise;

    expect(volume.dimensions).toEqual([8, 8, 8]);
    // Spacing must grow with the reduction or the volume shrinks in world space.
    expect(volume.spacing).toEqual([2, 2, 2]);

    const data = volume.voxelManager.getCompleteScalarDataArray();
    expect(Array.from(data)).toEqual(
      Array.from(fixture.levelData.get('d2').data)
    );
  });

  it('fires progress and completion events for its own volumeId', async () => {
    const modified = [];
    const completed = [];

    const onModified = (evt) => modified.push(evt.detail);
    const onCompleted = (evt) => completed.push(evt.detail);

    eventTarget.addEventListener(Events.IMAGE_VOLUME_MODIFIED, onModified);
    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_LOADING_COMPLETED,
      onCompleted
    );

    try {
      const { promise } = load({ coarseLevel: 'd2' });
      await promise;
      await flush();

      expect(modified.length).toBeGreaterThan(0);
      expect(modified.every((d) => d.volumeId === volumeId)).toBe(true);
      // Render paths filter on volumeId, so it is mandatory.
      expect(modified[modified.length - 1].framesProcessed).toBeGreaterThan(0);

      expect(completed).toHaveLength(1);
      expect(completed[0].volumeId).toBe(volumeId);
    } finally {
      eventTarget.removeEventListener(Events.IMAGE_VOLUME_MODIFIED, onModified);
      eventTarget.removeEventListener(
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
        onCompleted
      );
    }
  });

  it('invokes load callbacks instead of leaving them pending', async () => {
    const { promise } = load({ coarseLevel: 'd2' });
    const volume = await promise;

    // ImageVolume.load is a no-op stub upstream; brick volumes must honour it
    // because render paths call volume.load(() => requestRender()).
    const seen = jest.fn();
    volume.load(seen);
    await flush();

    expect(seen).toHaveBeenCalled();
  });

  it('exposes cancel under both names the cache and callers use', async () => {
    const loadObject = load({ coarseLevel: 'd2' });

    expect(typeof loadObject.cancel).toBe('function');
    expect(typeof loadObject.cancelFn).toBe('function');
    expect(typeof loadObject.decache).toBe('function');

    await loadObject.promise;
  });

  it('marks the z-slices each brick touched', async () => {
    const { promise } = load({ coarseLevel: 'd2' });
    const volume = await promise;

    const updated = volume.vtkOpenGLTexture.getUpdatedFrames?.() ?? [];

    // Every slice is covered by the upsampled coarse fill.
    expect(updated.filter(Boolean)).toHaveLength(16);
  });

  it('registers metadata for its synthetic slice image ids', async () => {
    const { promise } = load();
    const volume = await promise;

    // The slices are cache-only images with an invented id, so nothing else
    // provides metadata for them. Consumers that query by imageId must find it
    // here, or they fall through to loading the id.
    const middle = volume.imageIds[Math.floor(volume.imageIds.length / 2)];

    expect(metaData.get(MetadataModules.VOI_LUT, middle)).toMatchObject({
      windowWidth: 400,
      windowCenter: 40,
    });
    expect(metaData.get(MetadataModules.GENERAL_SERIES, middle)).toMatchObject({
      modality: 'CT',
    });
    expect(metaData.get(MetadataModules.IMAGE_PIXEL, middle)).toMatchObject({
      rows: volume.dimensions[1],
      columns: volume.dimensions[0],
    });
  });

  it('resolves a default VOI without reaching the image loader', async () => {
    const { promise } = load();
    const volume = await promise;

    // Regression: `setDefaultVolumeVOI` runs during `createVolumeActor`, and
    // `loadAndCacheImage` dispatches to an image loader *before* consulting the
    // cache — so a cache-resident slice still threw "No image loader found for
    // scheme 'brick'". Registered VOI metadata means the imageId path is never
    // taken.
    // DICOM windowing: low = c - 0.5 - (w-1)/2, high = c - 0.5 + (w-1)/2.
    await expect(getDefaultVolumeVOIRange(volume)).resolves.toMatchObject({
      lower: -160,
      upper: 239,
    });
  });

  describe('refinement walks the pyramid', () => {
    let pyramid;

    const loadPyramid = (options) =>
      brickVolumeLoader(toBrickVolumeId(pyramid.baseUrl), {
        fetchBrick: pyramid.fetchBrick,
        decodeBrick: pyramid.decodeBrick,
        manifest: pyramid.manifest,
        ...options,
      });

    const levelsRequested = () =>
      pyramid.brickRequests().map((url) => url.match(/\/(d\d+)\//)?.[1]);

    beforeEach(() => {
      pyramid = buildBrickStoreFixture({
        baseUrl: `https://host/pyramid/${counter++}/brick/`,
        levels: ['d1', 'd2', 'd4', 'd8'],
      });
    });

    it('visits every intermediate level rather than jumping to the target', async () => {
      const { promise } = loadPyramid({
        coarseLevel: 'd8',
        refineToLevel: 'd1',
      });
      await promise;
      await flush();
      await flush();

      // Going d8 -> d1 directly leaves a long gap with nothing new on screen.
      // The intermediate levels are cheap and each visibly sharpens the image.
      const order = levelsRequested().filter(
        (level, i, all) => level !== all[i - 1]
      );

      expect(order).toEqual(['d8', 'd4', 'd2', 'd1']);
    });

    it('stops at the requested level rather than always reaching d1', async () => {
      const { promise } = loadPyramid({
        coarseLevel: 'd8',
        refineToLevel: 'd2',
      });
      await promise;
      await flush();
      await flush();

      expect(new Set(levelsRequested())).toEqual(new Set(['d8', 'd4', 'd2']));
    });

    it('refines only the bricks the displayed planes cut', async () => {
      // The camera is supplied up front. Without it there is nothing to be
      // selective about, so the loader correctly falls back to fetching the
      // whole level rather than quietly ignoring refineToLevel.
      const { promise } = loadPyramid({
        coarseLevel: 'd8',
        refineToLevel: 'd1',
        displayedPlanes: [{ normalWorld: [0, 0, 1], pointWorld: [0, 0, 8] }],
      });
      await promise;

      for (let i = 0; i < 6; i++) {
        await flush();
      }

      // d1 is a 2x2x2 brick grid; a single axial slab is 4 of the 8 bricks.
      // Fetching the level entire would defeat the point of a brick store.
      const d1 = pyramid.brickRequests().filter((url) => url.includes('/d1/'));

      expect(d1.length).toBeGreaterThan(0);
      expect(d1.length).toBeLessThan(8);
    });

    it('fetches the whole level when no camera is ever reported', async () => {
      const { promise } = loadPyramid({
        coarseLevel: 'd8',
        refineToLevel: 'd1',
      });
      await promise;

      for (let i = 0; i < 6; i++) {
        await flush();
      }

      const d1 = pyramid.brickRequests().filter((url) => url.includes('/d1/'));

      expect(d1).toHaveLength(8);
    });

    it('selects bricks at every level, not just the finest', async () => {
      // Regression: displayed planes are held in full-resolution index space,
      // but each level has its own grid — a d4 voxel spans four d1 voxels.
      // Without dividing the plane point by the level factor it lands outside
      // the coarser grid entirely and matches nothing, so the intermediate
      // levels silently fetched zero bricks and the ladder collapsed to
      // coarse -> full with nothing in between.
      const { promise } = loadPyramid({
        coarseLevel: 'd8',
        refineToLevel: 'd1',
      });
      const volume = await promise;

      setBrickVolumeDisplayedPlanes(volume.volumeId, [
        { normalWorld: [0, 0, 1], pointWorld: [0, 0, 8] },
      ]);

      for (let i = 0; i < 6; i++) {
        await flush();
      }

      const perLevel = {};
      for (const url of pyramid.brickRequests()) {
        const level = url.match(/\/(d\d+)\//)?.[1];
        perLevel[level] = (perLevel[level] ?? 0) + 1;
      }

      for (const level of ['d4', 'd2', 'd1']) {
        expect(perLevel[level] ?? 0).toBeGreaterThan(0);
      }
    });

    it('fetches only the coarse level when refinement is off', async () => {
      const { promise } = loadPyramid({ coarseLevel: 'd8' });
      await promise;
      await flush();

      expect(new Set(levelsRequested())).toEqual(new Set(['d8']));
    });
  });

  it('surfaces a bad manifest as a rejected promise', async () => {
    const { promise } = load({
      manifest: { ...fixture.manifest, brickSize: [0, 0, 0] },
    });

    await expect(promise).rejects.toThrow(/brickSize/);
  });

  it('skips an unreadable brick rather than failing the volume', async () => {
    // Must be a brick of the level actually loaded below, or nothing fails.
    const badUrl = [...fixture.store.keys()].find((u) => u.includes('/d2/'));
    fixture.store.delete(badUrl);

    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    try {
      const { promise } = load({ coarseLevel: 'd2' });
      await expect(promise).resolves.toBeDefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  describe('anisotropic ladder', () => {
    // The Juno shape in miniature: thick slices, so the pyramid reduces in-plane
    // first and the coarsest level is a single non-cubic brick covering the whole
    // volume. 32x32x10 at 1/1/5mm reduces to 16x16x10, then 8x8x5.
    let aniso;
    let anisoId;

    beforeEach(() => {
      aniso = buildBrickStoreFixture({
        baseUrl: `https://host/aniso/${counter++}/brick/`,
        dimensions: [32, 32, 10],
        brickSize: [8, 8, 8],
        levels: [
          { name: 'd1', brickSize: [8, 8, 8] },
          { name: 'd2_2_1', brickSize: [8, 8, 8] },
          // Small enough to be one request, so its brick is the level's shape
          { name: 'd4_4_2', brickSize: [8, 8, 5] },
        ],
      });
      anisoId = toBrickVolumeId(aniso.baseUrl);
    });

    const loadAniso = (options = {}) =>
      brickVolumeLoader(anisoId, {
        fetchBrick: aniso.fetchBrick,
        decodeBrick: aniso.decodeBrick,
        manifest: aniso.manifest,
        spacing: [1, 1, 5],
        ...options,
      });

    it('fetches the whole coarse level in a single request', async () => {
      const { promise } = loadAniso({ coarseLevel: 'd4_4_2' });
      await promise;

      expect(aniso.brickRequests()).toEqual([
        `${aniso.baseUrl}d4_4_2/k000/y0x0.jls`,
      ]);
    });

    it('upsamples per axis, so the volume keeps its true length', async () => {
      const { promise } = loadAniso({ coarseLevel: 'd4_4_2' });
      const volume = await promise;

      // Full extent at full-resolution spacing: the coarse level is 4x in-plane
      // and 2x through-plane, and collapsing that to one factor would give a
      // volume 2x too long in z.
      expect(volume.dimensions).toEqual([32, 32, 10]);
      expect(volume.spacing).toEqual([1, 1, 5]);

      const data = volume.voxelManager.getCompleteScalarDataArray();
      const coarse = aniso.levelData.get('d4_4_2');

      // Every voxel populated by nearest-upsampling the coarse level.
      expect(data.some((v) => v === 0)).toBe(false);
      // Voxel (5, 5, 3) of the volume comes from (1, 1, 1) of the coarse level.
      expect(data[5 + 5 * 32 + 3 * 32 * 32]).toBe(
        coarse.data[1 + 1 * 8 + 1 * 8 * 8]
      );
    });

    it('reduces at the coarse level"s own spacing when the extent is reduced', async () => {
      const { promise } = loadAniso({
        coarseLevel: 'd4_4_2',
        reducedExtent: true,
      });
      const volume = await promise;

      expect(volume.dimensions).toEqual([8, 8, 5]);
      // 4x in-plane and 2x through-plane, applied per axis.
      expect(volume.spacing).toEqual([4, 4, 10]);
    });

    it('refines to full resolution through the stored levels', async () => {
      const { promise } = loadAniso({
        coarseLevel: 'd4_4_2',
        refineToLevel: 'd1',
      });
      const volume = await promise;

      for (let i = 0; i < 6; i++) {
        await flush();
      }

      const data = volume.voxelManager.getCompleteScalarDataArray();

      // Refining through d2_2_1 to d1 must land on the source exactly: the
      // intermediate level reduces only in-plane, so a factor applied to all
      // three axes would leave every other slice holding coarse values.
      expect(Array.from(data)).toEqual(Array.from(aniso.source));
    });
  });
});
