import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, geometryLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events, GeometryType, ContourType } =
  Enums;

const renderingEngineId = utilities.uuidv4();

/** Makes a direct 3D viewport of 300 by 300 pixels, coronal. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'replacement3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.CORONAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('replacement3D');
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** Registers a display set of a fake volume of the given size. */
async function registerVolume(displaySetId, { rows, columns, slices }) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: displaySetId,
    id: displaySetId,
    rows,
    columns,
    slices,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return volumeId;
}

/** The picture on the canvas of the viewport. */
function pictureOf(viewport) {
  return viewport.canvas.toDataURL();
}

/**
 * Puts a data provider around the one of the viewport. It counts the loads of
 * each display set, and `hold` keeps the loads of a display set waiting until
 * `release`. `reached` resolves when a held load waits.
 */
function wrapDataProvider(viewport) {
  const provider = viewport.dataProvider;
  const loads = {};
  const gates = new Map();

  viewport.dataProvider = {
    load: async (displaySetId, options) => {
      loads[displaySetId] = (loads[displaySetId] ?? 0) + 1;

      const gate = gates.get(displaySetId);

      if (gate) {
        gate.markReached();
        await gate.promise;
      }

      return provider.load(displaySetId, options);
    },
  };

  return {
    loads,
    hold(displaySetId) {
      let release;
      let markReached;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      const reached = new Promise((resolve) => {
        markReached = resolve;
      });

      gates.set(displaySetId, { promise, release, reached, markReached });
    },
    reached(displaySetId) {
      return gates.get(displaySetId).reached;
    },
    release(displaySetId) {
      gates.get(displaySetId).release();
      gates.delete(displaySetId);
    },
  };
}

/** What the viewport shows: its display sets and the ids of its actors. */
function sceneOf(viewport) {
  return {
    displaySets: viewport.getDisplaySets(),
    actors: viewport.getActors().map(({ referencedId }) => referencedId),
  };
}

/** A volume display set entry of `setDisplaySets`. */
function volumeEntry(displaySetId) {
  return { displaySetId, options: { renderMode: 'vtkVolume3d' } };
}

describe('A failed replacement of the display sets of a 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('rejects and keeps the scene that was shown, as the legacy setVolumes did when a volume was missing', async function () {
    const viewport = createViewport(renderingEngine);
    const shownVolumeId = await registerVolume('replacement3D:shown', {
      rows: 30,
      columns: 40,
      slices: 12,
    });

    await registerVolume('replacement3D:first', {
      rows: 10,
      columns: 10,
      slices: 4,
    });
    await viewport.setDisplaySets({
      displaySetId: 'replacement3D:shown',
      options: { renderMode: 'vtkVolume3d' },
    });
    await renderAndWait(viewport);

    const shownPicture = pictureOf(viewport);
    const newVolumeEvents = [];

    viewport.element.addEventListener(Events.VOLUME_VIEWPORT_NEW_VOLUME, () =>
      newVolumeEvents.push(true)
    );

    let error;

    try {
      await viewport.setDisplaySets(
        {
          displaySetId: 'replacement3D:first',
          options: { renderMode: 'vtkVolume3d' },
        },
        {
          displaySetId: 'replacement3D:missing',
          options: { renderMode: 'vtkVolume3d' },
        }
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(viewport.getDisplaySets()).toEqual([
      { displaySetId: 'replacement3D:shown', options: { role: 'source' } },
    ]);
    expect(
      viewport.getActors().map(({ referencedId }) => referencedId)
    ).toEqual([shownVolumeId]);
    expect(newVolumeEvents.length).toBe(0);

    await renderAndWait(viewport);

    expect(pictureOf(viewport)).toBe(shownPicture);
  });

  it('rejects and keeps the scene that was shown when an entry is a cached contour, which the 3D viewport does not draw', async function () {
    const viewport = createViewport(renderingEngine);
    const shownVolumeId = await registerVolume('replacement3D:shown', {
      rows: 30,
      columns: 40,
      slices: 12,
    });

    await registerVolume('replacement3D:first', {
      rows: 10,
      columns: 10,
      slices: 4,
    });
    geometryLoader.createAndCacheGeometry('replacement3D:contour', {
      type: GeometryType.CONTOUR,
      geometryData: {
        id: 'replacement3D:contour',
        frameOfReferenceUID: 'Volume_Frame_Of_Reference',
        color: [255, 0, 0],
        segmentIndex: 1,
        data: [
          {
            points: [
              [0, 0, 0],
              [5, 0, 0],
              [5, 5, 0],
            ],
            type: ContourType.CLOSED_PLANAR,
            color: [255, 0, 0],
            segmentIndex: 1,
          },
        ],
      },
    });
    await viewport.setDisplaySets(volumeEntry('replacement3D:shown'));
    await renderAndWait(viewport);

    const shownPicture = pictureOf(viewport);
    const newVolumeEvents = [];

    viewport.element.addEventListener(Events.VOLUME_VIEWPORT_NEW_VOLUME, () =>
      newVolumeEvents.push(true)
    );

    let error;

    try {
      await viewport.setDisplaySets(volumeEntry('replacement3D:first'), {
        displaySetId: 'replacement3D:contour',
        options: { renderMode: 'vtkGeometry3d' },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:shown', options: { role: 'source' } },
      ],
      actors: [shownVolumeId],
    });
    expect(newVolumeEvents.length).toBe(0);

    await renderAndWait(viewport);

    expect(pictureOf(viewport)).toBe(shownPicture);
  });
});

describe('Two replacements of the display sets of a 3D viewport, one after the other -- ', () => {
  let renderingEngine;
  let viewport;
  let volumeIds;
  let provider;
  let newVolumeEvents;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    viewport = createViewport(renderingEngine);
    volumeIds = {};

    for (const name of ['shown', 'older', 'newer']) {
      volumeIds[name] = await registerVolume(`replacement3D:${name}`, {
        rows: 10,
        columns: 10,
        slices: 4,
      });
    }

    await viewport.setDisplaySets(volumeEntry('replacement3D:shown'));
    provider = wrapDataProvider(viewport);
    newVolumeEvents = [];
    viewport.element.addEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      (event) => {
        newVolumeEvents.push(
          event.detail.volumeActors.map(({ referencedId }) => referencedId)
        );
      }
    );
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('keeps the newer scene when the older call loads after the newer call mounted', async function () {
    provider.hold('replacement3D:older');

    const older = viewport.setDisplaySets(volumeEntry('replacement3D:older'));

    await viewport.setDisplaySets(volumeEntry('replacement3D:newer'));
    provider.release('replacement3D:older');
    await older;

    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:newer', options: { role: 'source' } },
      ],
      actors: [volumeIds.newer],
    });
    expect(newVolumeEvents).toEqual([[volumeIds.newer]]);
  });

  it('stays empty when the older call loads after the newer call cleared the viewport', async function () {
    provider.hold('replacement3D:older');

    const older = viewport.setDisplaySets(volumeEntry('replacement3D:older'));

    await viewport.setDisplaySets();
    provider.release('replacement3D:older');
    await older;

    expect(sceneOf(viewport)).toEqual({ displaySets: [], actors: [] });
    expect(newVolumeEvents).toEqual([]);
  });

  it('keeps the shown scene when the older call loads before the newer call, which then mounts', async function () {
    provider.hold('replacement3D:older');
    provider.hold('replacement3D:newer');

    const older = viewport.setDisplaySets(volumeEntry('replacement3D:older'));
    const newer = viewport.setDisplaySets(volumeEntry('replacement3D:newer'));

    provider.release('replacement3D:older');
    await older;

    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:shown', options: { role: 'source' } },
      ],
      actors: [volumeIds.shown],
    });
    expect(newVolumeEvents).toEqual([]);

    provider.release('replacement3D:newer');
    await newer;

    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:newer', options: { role: 'source' } },
      ],
      actors: [volumeIds.newer],
    });
    expect(newVolumeEvents).toEqual([[volumeIds.newer]]);
  });
});

describe('A replacement of the display sets of a 3D viewport that a newer call comes between two of its mounts -- ', () => {
  let renderingEngine;
  let viewport;
  let volumeIds;
  let newVolumeEvents;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    viewport = createViewport(renderingEngine);
    volumeIds = {};

    for (const name of ['shown', 'olderSource', 'olderOverlay', 'newer']) {
      volumeIds[name] = await registerVolume(`replacement3D:${name}`, {
        rows: 10,
        columns: 10,
        slices: 4,
      });
    }

    await viewport.setDisplaySets(volumeEntry('replacement3D:shown'));
    newVolumeEvents = [];
    viewport.element.addEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      (event) => {
        newVolumeEvents.push({
          volumeActors: event.detail.volumeActors.map(
            ({ referencedId }) => referencedId
          ),
          scene: sceneOf(viewport),
        });
      }
    );
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  /**
   * Replaces the shown scene with the older source and overlay, and starts
   * the newer call in the VOI_MODIFIED listener of the mount of the older
   * source, before the mount of the older overlay. Resolves with both calls.
   */
  function replaceWithNewerBetweenMounts(newerDisplaySetId) {
    let newer;

    viewport.element.addEventListener(Events.VOI_MODIFIED, (event) => {
      if (!newer && event.detail.volumeId === volumeIds.olderSource) {
        newer = viewport.setDisplaySets(volumeEntry(newerDisplaySetId));
      }
    });

    const older = viewport.setDisplaySets(
      volumeEntry('replacement3D:olderSource'),
      volumeEntry('replacement3D:olderOverlay')
    );

    return { older, newer: () => newer };
  }

  it('completes the swap of the older call, which fires its event, and ends with exactly the newer scene', async function () {
    const calls = replaceWithNewerBetweenMounts('replacement3D:newer');

    await calls.older;
    expect(calls.newer()).toBeDefined();
    await calls.newer();

    const olderScene = {
      displaySets: [
        {
          displaySetId: 'replacement3D:olderSource',
          options: { role: 'source' },
        },
        {
          displaySetId: 'replacement3D:olderOverlay',
          options: { role: 'overlay' },
        },
      ],
      actors: [volumeIds.olderSource, volumeIds.olderOverlay],
    };
    const newerScene = {
      displaySets: [
        { displaySetId: 'replacement3D:newer', options: { role: 'source' } },
      ],
      actors: [volumeIds.newer],
    };

    expect(sceneOf(viewport)).toEqual(newerScene);
    expect(newVolumeEvents).toEqual([
      {
        volumeActors: [volumeIds.olderSource, volumeIds.olderOverlay],
        scene: olderScene,
      },
      { volumeActors: [volumeIds.newer], scene: newerScene },
    ]);
  });

  it('keeps the complete scene of the older call when the newer call rejects', async function () {
    const calls = replaceWithNewerBetweenMounts('replacement3D:missing');
    let error;

    await calls.older;
    expect(calls.newer()).toBeDefined();

    try {
      await calls.newer();
    } catch (caught) {
      error = caught;
    }

    const olderScene = {
      displaySets: [
        {
          displaySetId: 'replacement3D:olderSource',
          options: { role: 'source' },
        },
        {
          displaySetId: 'replacement3D:olderOverlay',
          options: { role: 'overlay' },
        },
      ],
      actors: [volumeIds.olderSource, volumeIds.olderOverlay],
    };

    expect(error).toBeDefined();
    expect(sceneOf(viewport)).toEqual(olderScene);
    expect(newVolumeEvents).toEqual([
      {
        volumeActors: [volumeIds.olderSource, volumeIds.olderOverlay],
        scene: olderScene,
      },
    ]);
  });
});

describe('A replacement of the display sets of a 3D viewport and its loads -- ', () => {
  let renderingEngine;
  let viewport;
  let volumeIds;
  let provider;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
    viewport = createViewport(renderingEngine);
    volumeIds = {};

    for (const name of ['shown', 'first', 'second']) {
      volumeIds[name] = await registerVolume(`replacement3D:${name}`, {
        rows: 10,
        columns: 10,
        slices: 4,
      });
    }

    await viewport.setDisplaySets(volumeEntry('replacement3D:shown'));
    provider = wrapDataProvider(viewport);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('loads each display set once', async function () {
    await viewport.setDisplaySets(
      volumeEntry('replacement3D:first'),
      volumeEntry('replacement3D:second')
    );

    expect(provider.loads).toEqual({
      'replacement3D:first': 1,
      'replacement3D:second': 1,
    });
    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:first', options: { role: 'source' } },
        { displaySetId: 'replacement3D:second', options: { role: 'overlay' } },
      ],
      actors: [volumeIds.first, volumeIds.second],
    });
  });

  it('mounts what it loaded when the registration of the first display set goes while the second loads', async function () {
    const newVolumeEvents = [];

    viewport.element.addEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      (event) => {
        newVolumeEvents.push(
          event.detail.volumeActors.map(({ referencedId }) => referencedId)
        );
      }
    );
    provider.hold('replacement3D:second');

    const replacement = viewport.setDisplaySets(
      { displaySetId: 'replacement3D:first' },
      volumeEntry('replacement3D:second')
    );

    await provider.reached('replacement3D:second');
    utilities.genericViewportDisplaySetMetadataProvider.remove(
      'replacement3D:first'
    );
    provider.release('replacement3D:second');
    await replacement;

    expect(sceneOf(viewport)).toEqual({
      displaySets: [
        { displaySetId: 'replacement3D:first', options: { role: 'source' } },
        { displaySetId: 'replacement3D:second', options: { role: 'overlay' } },
      ],
      actors: [volumeIds.first, volumeIds.second],
    });
    expect(newVolumeEvents).toEqual([[volumeIds.first, volumeIds.second]]);
  });

  it('rejects and keeps the shown scene when the volume that it loaded leaves the cache while the second loads', async function () {
    const newVolumeEvents = [];

    viewport.element.addEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      (event) => {
        newVolumeEvents.push(event.detail.volumeActors.length);
      }
    );
    const shownScene = sceneOf(viewport);

    provider.hold('replacement3D:second');

    const replacement = viewport.setDisplaySets(
      volumeEntry('replacement3D:first'),
      volumeEntry('replacement3D:second')
    );

    await provider.reached('replacement3D:second');
    cache.removeVolumeLoadObject(volumeIds.first);
    expect(cache.getVolume(volumeIds.first)).toBeUndefined();
    provider.release('replacement3D:second');

    let error;

    try {
      await replacement;
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(sceneOf(viewport)).toEqual(shownScene);
    expect(newVolumeEvents).toEqual([]);
  });

  it('draws the volume that it loaded with the actor, not one that the cache gives for its id at the mount', async function () {
    const firstVolume = cache.getVolume(volumeIds.first);
    const getVolume = cache.getVolume.bind(cache);
    const getVolumeLoadObject = cache.getVolumeLoadObject.bind(cache);

    provider.hold('replacement3D:second');

    const replacement = viewport.setDisplaySets(
      volumeEntry('replacement3D:first'),
      volumeEntry('replacement3D:second')
    );

    await provider.reached('replacement3D:second');
    const otherVolume = cache.getVolume(volumeIds.shown);
    spyOn(cache, 'getVolume').and.callFake((volumeId) =>
      volumeId === volumeIds.first ? otherVolume : getVolume(volumeId)
    );
    spyOn(cache, 'getVolumeLoadObject').and.callFake((volumeId) =>
      volumeId === volumeIds.first
        ? { promise: Promise.resolve(otherVolume) }
        : getVolumeLoadObject(volumeId)
    );
    provider.release('replacement3D:second');
    await replacement;

    expect(sceneOf(viewport).displaySets).toEqual([
      { displaySetId: 'replacement3D:first', options: { role: 'source' } },
      { displaySetId: 'replacement3D:second', options: { role: 'overlay' } },
    ]);
    expect(
      viewport.getActors()[0].actor.getMapper().getInputData() ===
        firstVolume.imageData
    ).toBe(true);
  });
});
