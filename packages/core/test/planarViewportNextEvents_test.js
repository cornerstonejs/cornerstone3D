import * as cornerstone3D from '../src/index';
import * as csTools3d from '../../tools/src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showStack as showSeriesStack,
  showVolume as showSeriesVolume,
  sliceNormal,
  waitFor,
  drawPathOf,
} from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { CrosshairsTool, ToolGroupManager, synchronizers } = csTools3d;

const renderingEngineId = utilities.uuidv4();

/**
 * Enables a viewport of a type with the default options, through the
 * rendering engine.
 */
function enableViewport(
  renderingEngine,
  { viewportId, type, orientation, defaultOptions = {} }
) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId,
    type,
    element,
    defaultOptions: { background: [1, 0, 1], orientation, ...defaultOptions },
  });

  return renderingEngine.getViewport(viewportId);
}

/** Makes a direct next planar viewport with the id `next`. */
function createNextPlanarViewport(
  renderingEngine,
  { orientation, defaultOptions }
) {
  return enableViewport(renderingEngine, {
    viewportId: 'next',
    type: ViewportType.PLANAR,
    orientation,
    defaultOptions,
  });
}

/**
 * How many times CrosshairsTool handled VOLUME_VIEWPORT_NEW_VOLUME when a
 * new volume was shown on one of two legacy volume viewports of its tool
 * group. A 6.0 viewport fires DISPLAY_SETS_CHANGED there, once.
 */
const LEGACY_CROSSHAIRS_NEW_VOLUME_CALLS = 1;

/**
 * The invert that the target of the VOI synchroniser showed when the source
 * was inverted, both legacy volume viewports.
 */
const LEGACY_SYNCED_INVERT = true;

/**
 * The slab of the target of the slab thickness synchroniser against the slab
 * of the source, both legacy volume viewports: the source had 5 and the
 * target got 5.
 */
const LEGACY_SYNCED_SLAB_RATIO = 1;

/**
 * The volumes of a target that showed two volumes that got the slab of the
 * slab thickness synchroniser, both legacy volume viewports: the target's
 * `setSlabThickness` gave it to every `vtkVolume` actor.
 */
const LEGACY_SYNCED_SLAB_VOLUMES = 2;

/**
 * What the legacy stack viewport with `suppressEvents` in its default
 * options gave for `suppressEvents`, and the CAMERA_MODIFIED events that it
 * fired for `setZoom(2)`.
 */
const LEGACY_SUPPRESSED_ZOOM = { suppressEvents: true, cameraEvents: 0 };

/**
 * The loads of image 1 of a stack on the legacy stack viewport, with the
 * image retrieve configuration of a lossy and a final stage, and the image
 * quality of each STACK_NEW_IMAGE of that image.
 */
const LEGACY_STAGED_LOADS = {
  requests: [
    {
      retrieveType: 'lossy',
      priority: 5,
      requestType: Enums.RequestType.Interaction,
      useRGBA: false,
    },
    {
      retrieveType: 'final',
      priority: 5,
      requestType: Enums.RequestType.Interaction,
      useRGBA: false,
    },
  ],
  stages: [
    Enums.ImageQualityStatus.LOSSY,
    Enums.ImageQualityStatus.FULL_RESOLUTION,
  ],
};

/**
 * The load of image 1 of a stack on the legacy stack viewport with no image
 * retrieve configuration, and the image quality of its STACK_NEW_IMAGE.
 */
const LEGACY_PLAIN_LOADS = {
  requests: [
    {
      retrieveType: undefined,
      priority: 5,
      requestType: Enums.RequestType.Interaction,
      useRGBA: false,
    },
  ],
  stages: [Enums.ImageQualityStatus.FULL_RESOLUTION],
};

/**
 * The canvas points of three corners of the first image of
 * `createStackImageIds`, as `getImageCornersOnCanvas` gives them, on the
 * legacy stack viewport of 400 by 300 pixels with `aspectRatio: [2, 1]` in
 * its options: the same at the mount and after a zoom, a pan and
 * `resetCamera`, the picture at half its height. The fit of this image is
 * bound by its width, so the scale pair [1, 1 / 2] of a next viewport shows
 * the same picture.
 */
const LEGACY_ASPECT_RATIO_CORNERS = [
  [3.1, 101.6],
  [396.9, 101.6],
  [3.1, 198.4],
];

/**
 * The same corners on the legacy stack viewport with the display area of
 * `DISPLAY_AREA_OPTIONS` in its options. It did not apply the display area
 * at the mount, which showed the fit of the image, and applied it after a
 * zoom, a pan and `resetCamera`.
 */
const LEGACY_DISPLAY_AREA_CORNERS = {
  atMount: [
    [3.1, 53.1],
    [396.9, 53.1],
    [3.1, 246.9],
  ],
  afterReset: [
    [6.3, 56.3],
    [793.8, 56.3],
    [6.3, 443.7],
  ],
};

/** A display area in the options of a viewport. */
const DISPLAY_AREA_OPTIONS = {
  displayArea: {
    imageArea: [0.5, 0.5],
    imageCanvasPoint: {
      imagePoint: [0.25, 0.25],
      canvasPoint: [0.5, 0.5],
    },
  },
};

/**
 * What IMAGE_SPACING_CALIBRATED of the legacy stack viewport gave, as
 * `recordCalibrationEvents` records it, when it showed the images 1, 2 and 1
 * of `createCalibratedImageIds` after image 0: an event each time image 1,
 * whose calibration is new, was shown.
 */
const LEGACY_CALIBRATION_EVENTS = [1, 1].map((imageIdIndex) => ({
  imageIdIndex,
  viewportId: 'legacy',
  scale: 2,
  calibrationScale: 2,
  hasImageData: true,
  worldToIndexOfPoint: [10, 4],
}));

/**
 * How many DISPLAY_SET_APPEARANCE_CHANGED events a planar viewport fires for
 * each range that `countVOIEvents` sets: the range on display, a new range
 * three times, then another range. The range on display fires one, because
 * it becomes an explicit override; a range that is set again fires none. The
 * same in stack and volume mode, on the GPU and the CPU. The legacy stack
 * viewport of 5.x fired [0, 1, 0, 0, 1] on the GPU and one for each on the
 * CPU; the legacy volume viewport one for each.
 */
const APPEARANCE_VOI_EVENTS = [1, 1, 0, 0, 1];

/** Makes and caches a volume of the fake volume loader. */
async function createVolume(name = 'volumeURI') {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
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

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Sets on the source display set of a direct next viewport the range on
 * display, the range 0 to 100 three times and the range 20 to 120, and
 * counts the DISPLAY_SET_APPEARANCE_CHANGED events of each.
 */
async function countVOIEvents(viewport) {
  const displaySetId = viewport.getSourceDisplaySetId();
  const shownRange =
    viewport.getEffectiveDisplaySetAppearance(displaySetId).voiRange;
  const ranges = [
    shownRange,
    { lower: 0, upper: 100 },
    { lower: 0, upper: 100 },
    { lower: 0, upper: 100 },
    { lower: 20, upper: 120 },
  ];
  const counts = [];
  let count = 0;
  const listener = () => {
    count += 1;
  };

  await frames();
  viewport.element.addEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    listener
  );

  for (const range of ranges) {
    count = 0;
    viewport.setDisplaySetAppearance(displaySetId, {
      voiRange: { ...range },
    });
    viewport.render();
    await frames();
    counts.push(count);
  }

  viewport.element.removeEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    listener
  );

  return counts;
}

/** Shows a volume on a direct next viewport. */
async function showVolume(viewport, volumeId, orientation) {
  const displaySetId = `volume:${viewport.id}:${volumeId}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);
}

/** The display set id of the volume that `showVolume` mounted last. */
function getVolumeDisplaySetId(viewport) {
  return viewport.getSourceDisplaySetId?.();
}

/** Sets the invert of a direct next viewport. */
function setInvert(viewport, invert) {
  viewport.setDisplaySetAppearance(getVolumeDisplaySetId(viewport), {
    invert,
  });
}

/** The invert that a direct next viewport shows. */
function getInvert(viewport) {
  return Boolean(
    viewport.getDisplaySetAppearance(getVolumeDisplaySetId(viewport))?.invert
  );
}

/** The image ids of a stack of 3 images of 64 by 32 pixels, 1 mm apart. */
function createStackImageIds(name = 'imageURI') {
  return [0, 1, 2].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      rows: 32,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/** Shows a stack on a direct next viewport through a display set. */
async function showStack(viewport, imageIds) {
  const displaySetId = `stack:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);
}

/**
 * The canvas points of three corners of the first image of
 * `createStackImageIds`, rounded to 0.1 px.
 */
function getImageCornersOnCanvas(viewport) {
  return [
    [0, 0, 0],
    [63, 0, 0],
    [0, 31, 0],
  ].map((point) =>
    viewport.worldToCanvas(point).map((value) => Math.round(value * 10) / 10)
  );
}

function expectCornersClose(actual, expected) {
  actual.forEach((point, index) => {
    expect(Math.abs(point[0] - expected[index][0])).toBeLessThan(1);
    expect(Math.abs(point[1] - expected[index][1])).toBeLessThan(1);
  });
}

describe('Direct next planar viewport events against the legacy viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
      tools: [CrosshairsTool],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    ToolGroupManager.destroyToolGroup('crosshairs');
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  describe('new data', () => {
    it('fires DISPLAY_SETS_CHANGED once when a volume is shown, as the legacy setVolumes fired VOLUME_VIEWPORT_NEW_VOLUME, when getActors gives the actor of the volume', async function () {
      const volumeId = await createVolume();
      const viewport = createNextPlanarViewport(renderingEngine, {
        orientation: OrientationAxis.AXIAL,
      });
      const details = [];

      viewport.element.addEventListener(Events.DISPLAY_SETS_CHANGED, (evt) =>
        details.push({ ...evt.detail, actors: viewport.getActors() })
      );
      await showVolume(viewport, volumeId, OrientationAxis.AXIAL);
      await frames();

      const next = details.map(
        ({ viewportId, displaySets, sourceChanged, actors }) => ({
          viewportId,
          displaySets,
          sourceChanged,
          volumeIds: actors.map((entry) => entry.referencedId),
          actorClasses: actors.map((entry) => entry.actor.getClassName()),
        })
      );

      expect(next.length).toBe(1);
      expect(next[0].viewportId).toBe('next');
      expect(next[0].displaySets).toEqual([
        { displaySetId: getVolumeDisplaySetId(viewport), role: 'source' },
      ]);
      expect(next[0].sourceChanged).toBe(true);
      expect(next[0].volumeIds).toEqual([volumeId]);
      expect(next[0].actorClasses.length).toBe(1);
    });

    it('lets CrosshairsTool follow a new volume on direct next viewports as on legacy ones', async function () {
      const volumeId = await createVolume();
      const otherVolumeId = await createVolume('otherVolumeURI');
      const viewports = [OrientationAxis.AXIAL, OrientationAxis.SAGITTAL].map(
        (orientation, index) =>
          enableViewport(renderingEngine, {
            viewportId: `next${index}`,
            type: ViewportType.PLANAR,
            orientation,
          })
      );

      for (const [index, viewport] of viewports.entries()) {
        await showVolume(
          viewport,
          volumeId,
          index ? OrientationAxis.SAGITTAL : OrientationAxis.AXIAL
        );
      }

      ToolGroupManager.destroyToolGroup('crosshairs');

      const toolGroup = ToolGroupManager.createToolGroup('crosshairs');

      toolGroup.addTool(CrosshairsTool.toolName);
      viewports.forEach((viewport) =>
        toolGroup.addViewport(viewport.id, renderingEngine.id)
      );
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });
      await frames();

      const tool = toolGroup.getToolInstance(CrosshairsTool.toolName);
      let count = 0;
      let centers = 0;
      const onNewVolume = tool._onNewVolume;
      const computeToolCenter = tool._computeToolCenter;

      tool._onNewVolume = (evt) => {
        count++;
        onNewVolume(evt);
      };
      tool._computeToolCenter = (...args) => {
        centers++;

        return computeToolCenter(...args);
      };

      await showVolume(viewports[0], otherVolumeId, OrientationAxis.AXIAL);
      await frames();

      expect(count).toBe(LEGACY_CROSSHAIRS_NEW_VOLUME_CALLS);

      const centersAfterNewVolume = centers;
      const overlayDisplaySetId = 'overlay:next0';

      cornerstone3D.displaySetRegistry.add(overlayDisplaySetId, {
        imageIds: cache.getVolume(volumeId).imageIds,
        volumeId,
      });
      await viewports[0].addDisplaySet(overlayDisplaySetId, {
        role: 'overlay',
        orientation: OrientationAxis.AXIAL,
      });
      viewports[0].removeDisplaySet(overlayDisplaySetId);
      await frames();

      expect(centersAfterNewVolume).toBeGreaterThan(0);
      expect(count).toBe(LEGACY_CROSSHAIRS_NEW_VOLUME_CALLS + 2);
      expect(centers).toBe(centersAfterNewVolume);
    });
  });

  describe('DISPLAY_SET_APPEARANCE_CHANGED of the window', () => {
    it('lets the VOI synchroniser sync an invert from a direct next viewport, as from a legacy one', async function () {
      const volumeId = await createVolume();
      const [source, target] = [0, 1].map((index) =>
        enableViewport(renderingEngine, {
          viewportId: `next${index}`,
          type: ViewportType.PLANAR,
          orientation: OrientationAxis.AXIAL,
        })
      );

      await showVolume(source, volumeId, OrientationAxis.AXIAL);
      await showVolume(target, volumeId, OrientationAxis.AXIAL);

      const synchronizer = synchronizers.createVOISynchronizer('voi:next', {
        syncInvertState: true,
        syncColormap: false,
      });

      synchronizer.addSource({
        renderingEngineId: renderingEngine.id,
        viewportId: source.id,
      });
      synchronizer.addTarget({
        renderingEngineId: renderingEngine.id,
        viewportId: target.id,
      });
      setInvert(source, true);
      await frames();

      const invert = getInvert(target);

      csTools3d.SynchronizerManager.destroySynchronizer('voi:next');

      expect(invert).toBe(LEGACY_SYNCED_INVERT);
    });

    it('fires once for each change of the window and none for a window that is set again, in stack and volume mode, on the GPU and on the CPU', async function () {
      const series = await createSeries({ id: 'voiEvents' });
      const counts = [];

      for (const show of [showSeriesStack, showSeriesVolume]) {
        for (const options of [{}, { renderBackend: 'cpu' }]) {
          const viewport = createNextViewport(
            renderingEngine,
            `voiEvents${counts.length}`
          );

          await show(viewport, series, 0, options);
          counts.push(await countVOIEvents(viewport));
        }
      }

      expect(counts).toEqual([
        APPEARANCE_VOI_EVENTS,
        APPEARANCE_VOI_EVENTS,
        APPEARANCE_VOI_EVENTS,
        APPEARANCE_VOI_EVENTS,
      ]);
    });
  });

  describe('a slab', () => {
    it('fires one DISPLAY_SET_APPEARANCE_CHANGED with the slab thickness when the slab changes, and no CAMERA_MODIFIED', async function () {
      const volumeId = await createVolume();
      const viewport = createNextPlanarViewport(renderingEngine, {
        orientation: OrientationAxis.AXIAL,
      });

      await showVolume(viewport, volumeId, OrientationAxis.AXIAL);

      const cameraEvents = [];
      const appearanceEvents = [];

      viewport.element.addEventListener(Events.CAMERA_MODIFIED, (evt) =>
        cameraEvents.push(evt.detail)
      );
      viewport.element.addEventListener(
        Events.DISPLAY_SET_APPEARANCE_CHANGED,
        (evt) => appearanceEvents.push(evt.detail)
      );
      viewport.setDisplaySetAppearance(getVolumeDisplaySetId(viewport), {
        slabThickness: 10,
      });

      expect(cameraEvents.length).toBe(0);
      expect(
        appearanceEvents.map(({ cause, changedKeys, overrides }) => ({
          cause,
          changedKeys,
          slabThickness: overrides.slabThickness,
        }))
      ).toEqual([
        { cause: 'edit', changedKeys: ['slabThickness'], slabThickness: 10 },
      ]);
    });

    it('lets the slab thickness synchroniser sync a slab from a direct next viewport, as from a legacy one', async function () {
      const volumeId = await createVolume();
      const [source, target] = [0, 1].map((index) =>
        enableViewport(renderingEngine, {
          viewportId: `next${index}`,
          type: ViewportType.PLANAR,
          orientation: OrientationAxis.AXIAL,
        })
      );

      await showVolume(source, volumeId, OrientationAxis.AXIAL);
      await showVolume(target, volumeId, OrientationAxis.CORONAL);

      const synchronizer =
        synchronizers.createSlabThicknessSynchronizer('slab:next');

      synchronizer.addSource({
        renderingEngineId: renderingEngine.id,
        viewportId: source.id,
      });
      synchronizer.addTarget({
        renderingEngineId: renderingEngine.id,
        viewportId: target.id,
      });
      source.setDisplaySetAppearance(getVolumeDisplaySetId(source), {
        slabThickness: 10,
      });
      await frames();

      const slabThickness = target.getDisplaySetAppearance(
        getVolumeDisplaySetId(target)
      )?.slabThickness;

      csTools3d.SynchronizerManager.destroySynchronizer('slab:next');

      expect(slabThickness).toBe(10 * LEGACY_SYNCED_SLAB_RATIO);
    });

    it('lets the slab thickness synchroniser give the slab to every volume of a target that shows two, as the legacy one did', async function () {
      const volumeId = await createVolume();
      const secondVolumeId = await createVolume('secondVolumeURI');
      const [source, target] = [0, 1].map((index) =>
        enableViewport(renderingEngine, {
          viewportId: `next${index}`,
          type: ViewportType.PLANAR,
          orientation: OrientationAxis.AXIAL,
        })
      );

      await showVolume(source, volumeId, OrientationAxis.AXIAL);
      [volumeId, secondVolumeId].forEach((id) => {
        cornerstone3D.displaySetRegistry.add(`volume:${target.id}:${id}`, {
          imageIds: cache.getVolume(id).imageIds,
          volumeId: id,
        });
      });
      await target.setDisplaySets(
        ...[volumeId, secondVolumeId].map((id) => ({
          displaySetId: `volume:${target.id}:${id}`,
          options: { orientation: OrientationAxis.CORONAL },
        }))
      );
      await renderAndWait(target);

      const synchronizer =
        synchronizers.createSlabThicknessSynchronizer('slab:fusion');

      synchronizer.addSource({
        renderingEngineId: renderingEngine.id,
        viewportId: source.id,
      });
      synchronizer.addTarget({
        renderingEngineId: renderingEngine.id,
        viewportId: target.id,
      });
      source.setDisplaySetAppearance(getVolumeDisplaySetId(source), {
        slabThickness: 10,
      });
      await frames();

      const slabbed = target
        .getDisplaySets()
        .filter(
          ({ displaySetId }) =>
            target.getDisplaySetAppearance(displaySetId)?.slabThickness === 10
        ).length;

      csTools3d.SynchronizerManager.destroySynchronizer('slab:fusion');

      expect(target.getDisplaySets().length).toBe(2);
      expect(slabbed).toBe(LEGACY_SYNCED_SLAB_VOLUMES);
    });
  });

  describe('suppressEvents from the options', () => {
    it('is honoured as on the legacy stack viewport', async function () {
      const imageIds = [0, 1, 2].map((sliceIndex) =>
        testUtils.encodeImageIdInfo({
          loader: 'fakeImageLoader',
          name: 'imageURI',
          rows: 64,
          columns: 64,
          barStart: 10,
          barWidth: 5,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      );
      const enabled = [];
      const onEnabled = (evt) => enabled.push(evt.detail.viewportId);
      let result;

      eventTarget.addEventListener(Events.ELEMENT_ENABLED, onEnabled);

      try {
        const viewport = createNextPlanarViewport(renderingEngine, {
          orientation: OrientationAxis.ACQUISITION,
          defaultOptions: { suppressEvents: true },
        });
        const cameraEvents = [];

        viewport.element.addEventListener(Events.CAMERA_MODIFIED, () =>
          cameraEvents.push(1)
        );

        cornerstone3D.displaySetRegistry.add('stack', {
          imageIds,
          initialImageIdIndex: 0,
        });
        await viewport.setDisplaySets({ displaySetId: 'stack' });
        await renderAndWait(viewport);
        await frames();
        cameraEvents.splice(0);
        viewport.setZoom(2);
        await frames();
        result = {
          suppressEvents: viewport.suppressEvents,
          cameraEvents: cameraEvents.length,
        };
      } finally {
        eventTarget.removeEventListener(Events.ELEMENT_ENABLED, onEnabled);
      }

      expect(result).toEqual(LEGACY_SUPPRESSED_ZOOM);
      expect(enabled).toEqual([]);
    });
  });

  describe('display area and stretch of the options on a direct next viewport', () => {
    /**
     * Shows the stack on a direct next viewport with the options, applies
     * them through `apply` after the mount and again after a zoom, a pan and
     * `resetViewState`, and gives the corners of the image on the canvas
     * before the first `apply`, after it and after the reset.
     */
    async function readCornersWithOptions(renderingEngine, options, apply) {
      const viewport = enableViewport(renderingEngine, {
        viewportId: 'next',
        type: ViewportType.PLANAR,
        orientation: OrientationAxis.ACQUISITION,
        defaultOptions: options,
      });

      await showStack(viewport, createStackImageIds('nextURI'));

      const plain = getImageCornersOnCanvas(viewport);

      apply(viewport);
      await renderAndWait(viewport);

      const atMount = getImageCornersOnCanvas(viewport);

      viewport.setViewState(
        cornerstone3D.viewportProjection.withFraming(viewport, {
          zoom: 3,
          pan: [20, 10],
        })
      );
      await renderAndWait(viewport);
      viewport.resetViewState();
      apply(viewport);
      await renderAndWait(viewport);

      return {
        plain,
        atMount,
        afterReset: getImageCornersOnCanvas(viewport),
      };
    }

    it('takes the display area of the options into the view state and leaves the aspect ratio to the application on a direct next viewport', async function () {
      const viewport = enableViewport(renderingEngine, {
        viewportId: 'next',
        type: ViewportType.PLANAR,
        orientation: OrientationAxis.ACQUISITION,
        defaultOptions: { aspectRatio: [2, 1], ...DISPLAY_AREA_OPTIONS },
      });

      await showStack(viewport, createStackImageIds('nextURI'));

      expect(viewport.getViewState().scale).toEqual([1, 1]);
      expect(viewport.getViewState().displayArea).toEqual(
        DISPLAY_AREA_OPTIONS.displayArea
      );
    });

    it('shows the display area of the options at the mount and, with storeAsInitialCamera, after a reset, as the legacy stack viewport after a reset', async function () {
      const corners = await readCornersWithOptions(
        renderingEngine,
        {
          displayArea: {
            ...DISPLAY_AREA_OPTIONS.displayArea,
            storeAsInitialCamera: true,
          },
        },
        () => undefined
      );

      expectCornersClose(corners.plain, LEGACY_DISPLAY_AREA_CORNERS.afterReset);
      expectCornersClose(
        corners.afterReset,
        LEGACY_DISPLAY_AREA_CORNERS.afterReset
      );
    });

    it('shows the fit after a reset when the display area of the options has no storeAsInitialCamera', async function () {
      const corners = await readCornersWithOptions(
        renderingEngine,
        DISPLAY_AREA_OPTIONS,
        () => undefined
      );

      expectCornersClose(corners.plain, LEGACY_DISPLAY_AREA_CORNERS.afterReset);
      expectCornersClose(
        corners.afterReset,
        LEGACY_DISPLAY_AREA_CORNERS.atMount
      );
    });

    it('shows the aspect ratio of the options with the scale pair of the view state at the mount and after a reset, as the legacy stack viewport', async function () {
      const corners = await readCornersWithOptions(
        renderingEngine,
        { aspectRatio: [2, 1] },
        (viewport) => {
          const [width, height] = viewport.defaultOptions.aspectRatio;

          viewport.setViewState({ scale: [1, height / width] });
        }
      );

      expectCornersClose(corners.atMount, LEGACY_ASPECT_RATIO_CORNERS);
      expectCornersClose(corners.afterReset, LEGACY_ASPECT_RATIO_CORNERS);
    });
  });

  describe('calibration', () => {
    /** The image ids of 3 images, of which the second has a user calibration. */
    function createCalibratedImageIds(viewport) {
      const imageIds = [64, 32, 64].map((columns, sliceIndex) =>
        testUtils.encodeImageIdInfo({
          loader: 'fakeImageLoader',
          name: `${viewport.id}CalibrationURI`,
          rows: 32,
          columns,
          barStart: 10,
          barWidth: 5,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex,
        })
      );

      utilities.calibratedPixelSpacingMetadataProvider.add(imageIds[1], {
        rowPixelSpacing: 0.5,
        columnPixelSpacing: 0.5,
        scale: 2,
        type: Enums.CalibrationTypes.USER,
      });

      return imageIds;
    }

    /** Records what IMAGE_SPACING_CALIBRATED gives for the images. */
    function recordCalibrationEvents(viewport, imageIds) {
      const events = [];

      viewport.element.addEventListener(
        Events.IMAGE_SPACING_CALIBRATED,
        (evt) => {
          const { worldToIndex } = evt.detail;

          events.push({
            imageIdIndex: imageIds.indexOf(evt.detail.imageId),
            viewportId: evt.detail.viewportId,
            scale: evt.detail.scale,
            calibrationScale: evt.detail.calibration?.scale,
            hasImageData: Boolean(evt.detail.imageData),
            worldToIndexOfPoint: worldToIndex
              ? [
                  worldToIndex[0] * 10 + worldToIndex[4] * 4 + worldToIndex[12],
                  worldToIndex[1] * 10 + worldToIndex[5] * 4 + worldToIndex[13],
                ].map((value) => Math.round(value * 1000) / 1000)
              : undefined,
          });
        }
      );

      return events;
    }

    it('fires IMAGE_SPACING_CALIBRATED on a direct next viewport from calibrateSpacing, and not when an image shows', async function () {
      const viewport = enableViewport(renderingEngine, {
        viewportId: 'next',
        type: ViewportType.PLANAR,
        orientation: OrientationAxis.ACQUISITION,
      });
      const imageIds = createCalibratedImageIds(viewport);
      const events = recordCalibrationEvents(viewport, imageIds);

      await showStack(viewport, imageIds);

      for (const imageIdIndex of [1, 2, 1]) {
        await viewport.setImageIdIndex(imageIdIndex);
        await renderAndWait(viewport);
      }

      expect(events).toEqual([]);
      expect(viewport.getImageData().calibration.scale).toBe(2);

      viewport.calibrateSpacing(imageIds[1]);

      expect(events).toEqual([
        {
          imageIdIndex: 1,
          viewportId: 'next',
          scale: 2,
          calibrationScale: 2,
          hasImageData: true,
          worldToIndexOfPoint: [10, 4],
        },
      ]);
    });

    it('fires IMAGE_SPACING_CALIBRATED with the detail of the legacy stack viewport when the application calls calibrateSpacing for a newly shown image of a new calibration', async function () {
      const viewport = enableViewport(renderingEngine, {
        viewportId: 'next',
        type: ViewportType.PLANAR,
        orientation: OrientationAxis.ACQUISITION,
      });
      const imageIds = createCalibratedImageIds(viewport);
      const events = recordCalibrationEvents(viewport, imageIds);
      let shownCalibration;

      viewport.element.addEventListener(Events.NEW_IMAGE, (evt) => {
        const { imageId } = evt.detail;
        const calibration = cornerstone3D.metaData.get(
          'calibratedPixelSpacing',
          imageId
        );

        if (calibration && calibration !== shownCalibration) {
          viewport.calibrateSpacing(imageId);
        }

        shownCalibration = calibration;
      });
      await showStack(viewport, imageIds);

      for (const imageIdIndex of [1, 2, 1]) {
        await viewport.setImageIdIndex(imageIdIndex);
        await renderAndWait(viewport);
      }

      expect(events).toEqual(
        LEGACY_CALIBRATION_EVENTS.map((event) => ({
          ...event,
          viewportId: 'next',
        }))
      );
    });
  });

  describe('the events of a slice change on a direct next viewport', () => {
    const sliceEvents = [
      Events.CAMERA_MODIFIED,
      Events.NEW_IMAGE,
      'CORNERSTONE_STACK_NEW_IMAGE',
      'CORNERSTONE_VOLUME_NEW_IMAGE',
      'CORNERSTONE_PRE_STACK_NEW_IMAGE',
      'CORNERSTONE_STACK_VIEWPORT_SCROLL',
    ];

    /** Records the slice events of an element, each with its detail. */
    function recordSliceEvents(element) {
      const events = [];

      sliceEvents.forEach((name) => {
        element.addEventListener(name, (evt) => {
          events.push({ name, detail: evt.detail });
        });
      });

      return events;
    }

    /** The details that the recorded events of one name gave. */
    function detailsOf(events, name) {
      return events
        .filter((event) => event.name === name)
        .map(({ detail }) => detail);
    }

    /** How far the camera of a CAMERA_MODIFIED detail moved along a normal. */
    function cameraStepAlong(detail, normal) {
      const { camera, previousCamera } = detail;

      return camera.focalPoint.reduce(
        (sum, value, axis) =>
          sum + (value - previousCamera.focalPoint[axis]) * normal[axis],
        0
      );
    }

    it('fires CAMERA_MODIFIED and NEW_IMAGE in stack mode, and none of the legacy stack events', async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, 'next');

      await showSeriesStack(viewport, series, 2);

      const events = recordSliceEvents(viewport.element);

      await viewport.scroll(1);
      await waitFor(() => detailsOf(events, Events.NEW_IMAGE).length > 0);
      await renderAndWait(viewport);

      const [cameraDetail] = detailsOf(events, Events.CAMERA_MODIFIED);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getCurrentImageIdIndex()).toBe(3);
      expect(detailsOf(events, Events.NEW_IMAGE)).toEqual([
        {
          viewportId: 'next',
          renderingEngineId,
          displaySetId: viewport.getSourceDisplaySetId(),
          sliceIndex: 3,
          numberOfSlices: series.size.slices,
          imageId: series.imageIds[3],
          image: jasmine.objectContaining({ imageId: series.imageIds[3] }),
        },
      ]);
      expect(cameraDetail).toEqual(
        jasmine.objectContaining({
          element: viewport.element,
          viewportId: 'next',
          renderingEngineId,
        })
      );
      expect(detailsOf(events, 'CORNERSTONE_STACK_NEW_IMAGE')).toEqual([]);
      expect(detailsOf(events, 'CORNERSTONE_VOLUME_NEW_IMAGE')).toEqual([]);
      expect(detailsOf(events, 'CORNERSTONE_PRE_STACK_NEW_IMAGE')).toEqual([]);
      expect(detailsOf(events, 'CORNERSTONE_STACK_VIEWPORT_SCROLL')).toEqual(
        []
      );
    });

    it('fires CAMERA_MODIFIED and NEW_IMAGE in volume mode, and none of the legacy events', async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, 'next');

      await showSeriesVolume(viewport, series, 2);

      const events = recordSliceEvents(viewport.element);
      const indexBefore = viewport.getCurrentImageIdIndex();

      await viewport.scroll(1);
      await waitFor(() => detailsOf(events, Events.NEW_IMAGE).length > 0);
      await renderAndWait(viewport);

      const [cameraDetail] = detailsOf(events, Events.CAMERA_MODIFIED);

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getCurrentImageIdIndex()).toBe(indexBefore + 1);
      expect(detailsOf(events, Events.NEW_IMAGE)).toEqual([
        {
          viewportId: 'next',
          renderingEngineId,
          displaySetId: viewport.getSourceDisplaySetId(),
          sliceIndex: indexBefore + 1,
          numberOfSlices: series.size.slices,
          imageId: viewport.getCurrentImageId(),
          image: undefined,
        },
      ]);
      expect(series.imageIds).toContain(viewport.getCurrentImageId());
      expect(detailsOf(events, 'CORNERSTONE_STACK_NEW_IMAGE')).toEqual([]);
      expect(detailsOf(events, 'CORNERSTONE_VOLUME_NEW_IMAGE')).toEqual([]);
      expect(cameraDetail).toEqual(
        jasmine.objectContaining({
          element: viewport.element,
          viewportId: 'next',
          renderingEngineId,
        })
      );
      expect(
        Math.abs(cameraStepAlong(cameraDetail, sliceNormal(series)))
      ).toBeCloseTo(series.size.sliceSpacing, 4);
      expect(detailsOf(events, 'CORNERSTONE_PRE_STACK_NEW_IMAGE')).toEqual([]);
      expect(detailsOf(events, 'CORNERSTONE_STACK_VIEWPORT_SCROLL')).toEqual(
        []
      );
    });

    /**
     * Scrolls one slice and gives the detail of the event `name` that the
     * scroll fired.
     */
    async function scrollOneSlice(viewport, events, name = Events.NEW_IMAGE) {
      const before = detailsOf(events, name).length;

      await viewport.scroll(1);
      await waitFor(() => detailsOf(events, name).length > before);
      await renderAndWait(viewport);

      return detailsOf(events, name)[before];
    }

    for (const [path, options, drawPath] of [
      ['on the GPU', {}, 'frame-gpu'],
      ['on the CPU', { renderBackend: 'cpu' }, 'frame-cpu'],
    ]) {
      it(`names the image on display in NEW_IMAGE in stack mode ${path}`, async function () {
        const series = await createSeries();
        const viewport = createNextViewport(renderingEngine, 'next');

        await showSeriesStack(viewport, series, 2, options);

        const events = recordSliceEvents(viewport.element);
        const detail = await scrollOneSlice(viewport, events);

        expect(viewport.getCurrentMode()).toBe('stack');
        expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
        expect(detail.imageId).toBe(series.imageIds[3]);
        expect(detail.imageId).toBe(viewport.getCurrentImageId());
        expect(detail.image.imageId).toBe(series.imageIds[3]);
        expect(detail.displaySetId).toBe(viewport.getSourceDisplaySetId());
        expect(detail.sliceIndex).toBe(viewport.getSliceIndex());
        expect(detail.imageIdIndex).toBeUndefined();
        expect(detail.numberOfSlices).toBe(viewport.getNumberOfSlices());
        expect(detailsOf(events, 'CORNERSTONE_STACK_NEW_IMAGE')).toEqual([]);
      });
    }

    for (const [path, options, drawPath] of [
      ['on the sampled slice path', {}, 'cpu-gpu'],
      ['on the volume slice path', { sliceFirst: false }, 'gpuVolume-gpu'],
      ['on the CPU', { renderBackend: 'cpu' }, 'cpu-cpu'],
    ]) {
      it(`names the image on display in NEW_IMAGE in volume mode ${path}, at the mount and after a scroll, where the slice index runs against the order of the images`, async function () {
        const series = await createSeries();
        const viewport = createNextViewport(renderingEngine, 'next');
        const events = recordSliceEvents(viewport.element);
        const displaySetId = 'volume:next';

        cornerstone3D.displaySetRegistry.add(displaySetId, {
          imageIds: series.imageIds,
          volumeId: series.volumeId,
        });
        await viewport.setDisplaySets({
          displaySetId,
          options: { orientation: OrientationAxis.ACQUISITION, ...options },
        });
        await renderAndWait(viewport);

        const mountDetails = detailsOf(events, Events.NEW_IMAGE);

        expect(viewport.getCurrentMode()).toBe('volume');
        expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
        expect(mountDetails.length).toBeGreaterThan(0);
        mountDetails.forEach((mountDetail) => {
          expect(mountDetail.imageId).toBe(viewport.getCurrentImageId());
        });
        expect(mountDetails.at(-1).sliceIndex).toBe(viewport.getSliceIndex());
        mountDetails.forEach((mountDetail) => {
          expect(mountDetail.displaySetId).toBe(displaySetId);
        });

        const detail = await scrollOneSlice(viewport, events);

        expect(series.imageIds).toContain(detail.imageId);
        expect(detail.imageId).toBe(viewport.getCurrentImageId());
        expect(detail.displaySetId).toBe(displaySetId);
        expect(detail.sliceIndex).toBe(viewport.getSliceIndex());
        expect(series.imageIds.indexOf(detail.imageId)).toBe(
          series.size.slices - 1 - detail.sliceIndex
        );
        expect(detail.numberOfSlices).toBe(viewport.getNumberOfSlices());
        expect(detail.image).toBeUndefined();
        expect(detailsOf(events, 'CORNERSTONE_STACK_NEW_IMAGE')).toEqual([]);
        expect(detailsOf(events, 'CORNERSTONE_VOLUME_NEW_IMAGE')).toEqual([]);
      });
    }

    it('gives no image id in NEW_IMAGE in volume mode when the view cuts across the images, and the slice index and the number of slices of the view', async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, 'next');

      await showSeriesVolume(viewport, series, 2, {
        orientation: OrientationAxis.SAGITTAL,
      });

      const events = recordSliceEvents(viewport.element);
      const detail = await scrollOneSlice(viewport, events);

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(viewport.getCurrentImageId()).toBeUndefined();
      expect(detail.imageId).toBeUndefined();
      expect(detail.image).toBeUndefined();
      expect(detail.displaySetId).toBe(viewport.getSourceDisplaySetId());
      expect(detail.sliceIndex).toBe(viewport.getSliceIndex());
      expect(detail.numberOfSlices).toBe(viewport.getNumberOfSlices());
      expect(detail.numberOfSlices).toBeGreaterThan(series.size.slices);
    });

    it('gives the display set and the slice index of the view in NEW_IMAGE on an oblique plane, with no image id', async function () {
      const series = await createSeries();
      const viewport = createNextViewport(renderingEngine, 'next');

      await showSeriesVolume(viewport, series, 2, {
        orientation: {
          viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
          viewUp: [0, -1, 0],
        },
      });

      const events = recordSliceEvents(viewport.element);
      const detail = await scrollOneSlice(viewport, events);

      expect(viewport.getCurrentMode()).toBe('volume');
      expect(utilities.isInAcquisitionPlane(viewport)).toBe(false);
      expect(detail.imageId).toBeUndefined();
      expect(detail.displaySetId).toBe(viewport.getSourceDisplaySetId());
      expect(detail.sliceIndex).toBe(viewport.getSliceIndex());
      expect(detail.numberOfSlices).toBe(viewport.getNumberOfSlices());
      expect(detail.imageIdIndex).toBeUndefined();
    });
  });

  describe('staged loading of a stack', () => {
    /**
     * Registers an image loader in place of the fake one that records the
     * request options of each load and gives the image the quality of its
     * retrieve options.
     */
    function recordLoads() {
      const requests = [];

      cornerstone3D.imageLoader.registerImageLoader(
        'fakeImageLoader',
        (imageId, options = {}) => {
          requests.push({
            imageId,
            retrieveType: options.retrieveType,
            priority: options.priority,
            requestType: options.requestType,
            useRGBA: options.useRGBA,
          });

          const { promise } = testUtils.fakeImageLoader(imageId, options);

          return {
            promise: promise.then((image) => {
              image.imageQualityStatus =
                options.retrieveOptions?.imageQualityStatus ??
                Enums.ImageQualityStatus.FULL_RESOLUTION;

              return image;
            }),
          };
        }
      );

      return requests;
    }

    /**
     * Shows image 1 of a stack on a direct next viewport and gives its loads
     * and the stages that NEW_IMAGE drew.
     */
    async function loadImageOne(viewport, requests) {
      const imageIds = createStackImageIds(`${viewport.id}StagedURI`);
      const stages = [];

      viewport.element.addEventListener(Events.NEW_IMAGE, (evt) => {
        if (evt.detail.imageId === imageIds[1]) {
          stages.push(evt.detail.image?.imageQualityStatus);
        }
      });
      await showStack(viewport, imageIds);
      await viewport.setImageIdIndex(1);
      await frames(5);

      return {
        stages,
        requests: requests
          .filter(({ imageId }) => imageId === imageIds[1])
          .map(({ imageId, ...rest }) => rest),
      };
    }

    afterEach(() => {
      utilities.imageRetrieveMetadataProvider.clear();
    });

    it('loads the stages of the image retrieve configuration, as the legacy stack viewport', async function () {
      cornerstone3D.metaData.addProvider(
        utilities.imageRetrieveMetadataProvider.get.bind(
          utilities.imageRetrieveMetadataProvider
        ),
        10000
      );
      utilities.imageRetrieveMetadataProvider.add('stack', {
        stages: [
          { id: 'lossyStage', retrieveType: 'lossy' },
          { id: 'finalStage', retrieveType: 'final' },
        ],
        retrieveOptions: {
          lossy: { imageQualityStatus: Enums.ImageQualityStatus.LOSSY },
          final: {},
        },
      });

      const viewport = createNextPlanarViewport(renderingEngine, {
        orientation: OrientationAxis.ACQUISITION,
      });
      const next = await loadImageOne(viewport, recordLoads());

      expect(next).toEqual(LEGACY_STAGED_LOADS);
    });

    it('loads an image with the request options of the legacy stack viewport when there is no configuration', async function () {
      const viewport = createNextPlanarViewport(renderingEngine, {
        orientation: OrientationAxis.ACQUISITION,
      });
      const next = await loadImageOne(viewport, recordLoads());

      expect(next).toEqual(LEGACY_PLAIN_LOADS);
    });
  });
});
