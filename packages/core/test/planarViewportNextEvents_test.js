import * as cornerstone3D from '../src/index';
import * as csTools3d from '../../tools/src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, getConfiguration, cache, eventTarget } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { CrosshairsTool, ToolGroupManager, synchronizers } = csTools3d;

const renderingEngineId = utilities.uuidv4();

/**
 * Enables a viewport of a type with the default options, through the
 * rendering engine. With `legacy` the switch of the generic viewports is off
 * while it is made, so it is the legacy class with or without
 * FORCE_GENERIC_VIEWPORT. With `adapter` the switch is on, so a legacy type
 * gives its legacy adapter.
 */
function enableViewport(
  renderingEngine,
  {
    viewportId,
    type,
    orientation,
    defaultOptions = {},
    legacy = false,
    adapter = false,
  }
) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);

  if (legacy || adapter) {
    rendering.useGenericViewport = adapter;
  }

  try {
    renderingEngine.enableElement({
      viewportId,
      type,
      element,
      defaultOptions: { background: [1, 0, 1], orientation, ...defaultOptions },
    });
  } finally {
    rendering.useGenericViewport = useGenericViewport;
  }

  return renderingEngine.getViewport(viewportId);
}

/**
 * Makes a legacy viewport with the id `legacy` and a direct next planar
 * viewport with the id `next`, of one size, orientation and options.
 */
function createPair(
  renderingEngine,
  { legacyType, orientation, defaultOptions, ids = ['legacy', 'next'] }
) {
  return [
    enableViewport(renderingEngine, {
      viewportId: ids[0],
      type: legacyType,
      orientation,
      defaultOptions,
      legacy: true,
    }),
    enableViewport(renderingEngine, {
      viewportId: ids[1],
      type: ViewportType.PLANAR_NEXT,
      orientation,
      defaultOptions,
    }),
  ];
}

/**
 * Makes a legacy stack viewport with the id `legacy` and its legacy adapter
 * with the id `adapter`, of one size and options.
 */
function createStackAdapterPair(renderingEngine, defaultOptions) {
  return ['legacy', 'adapter'].map((viewportId) =>
    enableViewport(renderingEngine, {
      viewportId,
      type: ViewportType.STACK,
      orientation: OrientationAxis.ACQUISITION,
      defaultOptions,
      legacy: viewportId === 'legacy',
      adapter: viewportId === 'adapter',
    })
  );
}

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

/** Shows a volume on a legacy volume viewport or a direct next viewport. */
async function showVolume(viewport, volumeId, orientation) {
  if (!utilities.isGenericViewport(viewport)) {
    await viewport.setVolumes([{ volumeId }]);
    await renderAndWait(viewport);

    return;
  }

  const displaySetId = `volume:${viewport.id}:${volumeId}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId, options: { orientation } });
  await renderAndWait(viewport);
}

/** The display set id of the volume that `showVolume` mounted last. */
function getVolumeDisplaySetId(viewport) {
  return viewport.getSourceDataId?.();
}

/** Sets the invert of a legacy viewport or of a direct next viewport. */
function setInvert(viewport, invert) {
  if (utilities.isGenericViewport(viewport)) {
    viewport.setDisplaySetPresentation(getVolumeDisplaySetId(viewport), {
      invert,
    });
  } else {
    viewport.setProperties({ invert });
  }
}

/** The invert that a legacy viewport or a direct next viewport shows. */
function getInvert(viewport) {
  if (utilities.isGenericViewport(viewport)) {
    return Boolean(
      viewport.getDisplaySetPresentation(getVolumeDisplaySetId(viewport))
        ?.invert
    );
  }

  return Boolean(viewport.getProperties().invert);
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

/**
 * Shows a stack on a legacy stack viewport or its adapter with `setStack`,
 * and on a direct next viewport through a display set.
 */
async function showStack(viewport, imageIds) {
  if (typeof viewport.setStack !== 'function') {
    const displaySetId = `stack:${viewport.id}`;

    utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
      kind: 'planar',
      imageIds,
      initialImageIdIndex: 0,
    });
    await viewport.setDisplaySets({ displaySetId });
  } else {
    await viewport.setStack(imageIds, 0);
  }

  await renderAndWait(viewport);
}

/** Resets the view of a legacy stack viewport or of its adapter. */
async function resetView(viewport) {
  viewport.resetCamera();
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
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  describe('new data', () => {
    it('fires VOLUME_VIEWPORT_NEW_VOLUME once when a volume is shown, as the legacy setVolumes', async function () {
      const volumeId = await createVolume();
      const results = [];

      for (const viewport of createPair(renderingEngine, {
        legacyType: ViewportType.ORTHOGRAPHIC,
        orientation: OrientationAxis.AXIAL,
      })) {
        const details = [];

        viewport.element.addEventListener(
          Events.VOLUME_VIEWPORT_NEW_VOLUME,
          (evt) => details.push(evt.detail)
        );
        await showVolume(viewport, volumeId, OrientationAxis.AXIAL);
        await frames();

        results.push(
          details.map(({ viewportId, volumeActors }) => ({
            viewportId,
            volumeIds: volumeActors.map((entry) => entry.referencedId),
            actorClasses: volumeActors.map((entry) =>
              entry.actor.getClassName()
            ),
          }))
        );
      }

      const [legacy, next] = results;

      expect(legacy.length).toBe(1);
      expect(next.length).toBe(1);
      expect(next[0].viewportId).toBe('next');
      expect(next[0].volumeIds).toEqual(legacy[0].volumeIds);
      expect(next[0].actorClasses.length).toBe(1);
    });

    it('lets CrosshairsTool follow a new volume on direct next viewports as on legacy ones', async function () {
      const volumeId = await createVolume();
      const otherVolumeId = await createVolume('otherVolumeURI');
      const calls = {};

      for (const legacy of [true, false]) {
        const prefix = legacy ? 'legacy' : 'next';
        const viewports = [OrientationAxis.AXIAL, OrientationAxis.SAGITTAL].map(
          (orientation, index) =>
            enableViewport(renderingEngine, {
              viewportId: `${prefix}${index}`,
              type: legacy
                ? ViewportType.ORTHOGRAPHIC
                : ViewportType.PLANAR_NEXT,
              orientation,
              legacy,
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
        const onNewVolume = tool._onNewVolume;

        tool._onNewVolume = (evt) => {
          count++;
          onNewVolume(evt);
        };

        await showVolume(viewports[0], otherVolumeId, OrientationAxis.AXIAL);
        await frames();
        calls[prefix] = count;
      }

      expect(calls.legacy).toBe(1);
      expect(calls.next).toBe(calls.legacy);
    });
  });

  describe('VOI_MODIFIED', () => {
    it('lets the VOI synchroniser sync an invert from a direct next viewport, as from a legacy one', async function () {
      const volumeId = await createVolume();
      const results = {};

      for (const legacy of [true, false]) {
        const prefix = legacy ? 'legacy' : 'next';
        const [source, target] = [0, 1].map((index) =>
          enableViewport(renderingEngine, {
            viewportId: `${prefix}${index}`,
            type: legacy ? ViewportType.ORTHOGRAPHIC : ViewportType.PLANAR_NEXT,
            orientation: OrientationAxis.AXIAL,
            legacy,
          })
        );

        await showVolume(source, volumeId, OrientationAxis.AXIAL);
        await showVolume(target, volumeId, OrientationAxis.AXIAL);

        const synchronizer = synchronizers.createVOISynchronizer(
          `voi:${prefix}`,
          { syncInvertState: true, syncColormap: false }
        );

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
        results[prefix] = getInvert(target);
        csTools3d.SynchronizerManager.destroySynchronizer(`voi:${prefix}`);
      }

      expect(results.legacy).toBe(true);
      expect(results.next).toBe(results.legacy);
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
      const results = [];
      const enabled = [];
      const onEnabled = (evt) => enabled.push(evt.detail.viewportId);

      eventTarget.addEventListener(Events.ELEMENT_ENABLED, onEnabled);

      try {
        for (const viewport of createPair(renderingEngine, {
          legacyType: ViewportType.STACK,
          orientation: OrientationAxis.ACQUISITION,
          defaultOptions: { suppressEvents: true },
        })) {
          const cameraEvents = [];

          viewport.element.addEventListener(Events.CAMERA_MODIFIED, () =>
            cameraEvents.push(1)
          );

          if (utilities.isGenericViewport(viewport)) {
            utilities.genericViewportDisplaySetMetadataProvider.add('stack', {
              kind: 'planar',
              imageIds,
              initialImageIdIndex: 0,
            });
            await viewport.setDisplaySets({ displaySetId: 'stack' });
          } else {
            await viewport.setStack(imageIds, 0);
          }

          await renderAndWait(viewport);
          await frames();
          cameraEvents.splice(0);
          viewport.setZoom(2);
          await frames();
          results.push({
            suppressEvents: viewport.suppressEvents,
            cameraEvents: cameraEvents.length,
          });
        }
      } finally {
        eventTarget.removeEventListener(Events.ELEMENT_ENABLED, onEnabled);
      }

      expect(results[0]).toEqual({ suppressEvents: true, cameraEvents: 0 });
      expect(results[1]).toEqual(results[0]);
      expect(enabled).toEqual([]);
    });
  });

  describe('display area and aspect ratio from the options of a legacy adapter', () => {
    const OPTIONS = {
      aspectRatio: { aspectRatio: [2, 1] },
      displayArea: {
        displayArea: {
          imageArea: [0.5, 0.5],
          imageCanvasPoint: {
            imagePoint: [0.25, 0.25],
            canvasPoint: [0.5, 0.5],
          },
        },
      },
    };

    Object.entries(OPTIONS).forEach(([name, defaultOptions]) => {
      it(`applies ${name} at mount and again at a reset, as the legacy stack viewport applies it at a reset`, async function () {
        const results = [];

        for (const viewport of createStackAdapterPair(
          renderingEngine,
          defaultOptions
        )) {
          await showStack(viewport, createStackImageIds(`${viewport.id}URI`));

          const atMount = getImageCornersOnCanvas(viewport);

          viewport.setZoom(3);
          viewport.setPan([20, 10]);
          await renderAndWait(viewport);
          await resetView(viewport);
          results.push({
            atMount,
            afterReset: getImageCornersOnCanvas(viewport),
            aspectRatio: viewport.getAspectRatio(),
          });
        }

        const [legacy, adapter] = results;

        expectCornersClose(adapter.atMount, legacy.afterReset);
        expectCornersClose(adapter.afterReset, legacy.afterReset);
        expect(adapter.aspectRatio).toEqual(legacy.aspectRatio);
      });
    });

    it('stretches the image with setAspectRatio and reads it back, as the legacy stack viewport', async function () {
      const results = [];

      for (const viewport of createStackAdapterPair(renderingEngine)) {
        await showStack(viewport, createStackImageIds(`${viewport.id}URI`));
        viewport.setAspectRatio([1, 2]);
        await renderAndWait(viewport);

        const kept = getImageCornersOnCanvas(viewport);

        viewport.setAspectRatio([3, 1], { fit: true });
        await renderAndWait(viewport);
        results.push({
          kept,
          fit: getImageCornersOnCanvas(viewport),
          aspectRatio: viewport.getAspectRatio(),
        });
      }

      const [legacy, adapter] = results;

      expectCornersClose(adapter.kept, legacy.kept);
      expectCornersClose(adapter.fit, legacy.fit);
      expect(adapter.aspectRatio).toEqual(legacy.aspectRatio);
    });

    it('leaves the options to the application on a direct next viewport', async function () {
      const viewport = enableViewport(renderingEngine, {
        viewportId: 'next',
        type: ViewportType.PLANAR_NEXT,
        orientation: OrientationAxis.ACQUISITION,
        defaultOptions: { ...OPTIONS.aspectRatio, ...OPTIONS.displayArea },
      });

      await showStack(viewport, createStackImageIds('nextURI'));

      expect(viewport.getViewState().scale).toEqual([1, 1]);
      expect(viewport.getViewState().displayArea).toBeUndefined();
    });
  });

  describe('calibration', () => {
    it('fires IMAGE_SPACING_CALIBRATED when a newly shown image has a new calibration, as the legacy stack viewport', async function () {
      const results = [];

      for (const viewport of createPair(renderingEngine, {
        legacyType: ViewportType.STACK,
        orientation: OrientationAxis.ACQUISITION,
      })) {
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
        const events = [];

        utilities.calibratedPixelSpacingMetadataProvider.add(imageIds[1], {
          rowPixelSpacing: 0.5,
          columnPixelSpacing: 0.5,
          scale: 2,
          type: Enums.CalibrationTypes.USER,
        });
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
                    worldToIndex[0] * 10 +
                      worldToIndex[4] * 4 +
                      worldToIndex[12],
                    worldToIndex[1] * 10 +
                      worldToIndex[5] * 4 +
                      worldToIndex[13],
                  ].map((value) => Math.round(value * 1000) / 1000)
                : undefined,
            });
          }
        );

        await showStack(viewport, imageIds);

        for (const imageIdIndex of [1, 2]) {
          await viewport.setImageIdIndex(imageIdIndex);
          await renderAndWait(viewport);
        }

        results.push(events);
      }

      const [legacy, next] = results;

      expect(legacy.map(({ imageIdIndex }) => imageIdIndex)).toEqual([1]);
      expect(legacy[0].scale).toBe(2);
      expect(next).toEqual(
        legacy.map((event) => ({ ...event, viewportId: 'next' }))
      );
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

    /** Shows image 1 of a stack and gives its loads and drawn stages. */
    async function loadImageOne(viewport, requests) {
      const imageIds = createStackImageIds(`${viewport.id}StagedURI`);
      const stages = [];

      viewport.element.addEventListener(Events.STACK_NEW_IMAGE, (evt) => {
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

      const results = [];

      for (const viewport of createPair(renderingEngine, {
        legacyType: ViewportType.STACK,
        orientation: OrientationAxis.ACQUISITION,
      })) {
        results.push(await loadImageOne(viewport, recordLoads()));
      }

      const [legacy, next] = results;

      expect(legacy.requests.map(({ retrieveType }) => retrieveType)).toEqual([
        'lossy',
        'final',
      ]);
      expect(legacy.stages).toEqual([
        Enums.ImageQualityStatus.LOSSY,
        Enums.ImageQualityStatus.FULL_RESOLUTION,
      ]);
      expect(next).toEqual(legacy);
    });

    it('loads an image with the request options of the legacy stack viewport when there is no configuration', async function () {
      const results = [];

      for (const viewport of createPair(renderingEngine, {
        legacyType: ViewportType.STACK,
        orientation: OrientationAxis.ACQUISITION,
      })) {
        results.push(await loadImageOne(viewport, recordLoads()));
      }

      const [legacy, next] = results;

      expect(legacy.requests).toEqual([
        {
          retrieveType: undefined,
          priority: 5,
          requestType: Enums.RequestType.Interaction,
          useRGBA: false,
        },
      ]);
      expect(next).toEqual(legacy);
    });
  });
});
