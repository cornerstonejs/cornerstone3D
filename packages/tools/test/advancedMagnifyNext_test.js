import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { AdvancedMagnifyTool, ToolGroupManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'advancedMagnifyNext';

/** The image ids of a stack of 6 images 1 mm apart along z. */
function createStackImageIds(options = {}) {
  return Array.from({ length: 6 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'magnifyStack',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
      ...options,
    })
  );
}

/** Makes a direct next planar viewport and adds it to the tool group. */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'next',
    viewportType: ViewportType.PLANAR_NEXT,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    useEnableElement: true,
  });
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    'next',
    renderingEngineId
  );

  return renderingEngine.getViewport('next');
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

/** Shows a stack on the direct next viewport through a display set. */
async function showStack(viewport, imageIds) {
  utilities.genericViewportDisplaySetMetadataProvider.add('magnifyStack', {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId: 'magnifyStack' });
  await renderAndWait(viewport);
}

/** Makes a volume and shows it on the direct next viewport. */
async function showVolume(viewport, name) {
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
  utilities.genericViewportDisplaySetMetadataProvider.add(name, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId: name,
    options: { orientation: OrientationAxis.AXIAL },
  });
  await renderAndWait(viewport);
}

/** Goes to an image index and resolves when the element fires `eventName`. */
function showImage(viewport, imageIdIndex, eventName = Events.STACK_NEW_IMAGE) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(eventName, resolve, { once: true });
    viewport.setImageIdIndex(imageIdIndex);
  });
}

/**
 * Resolves once the magnifying glass shows its images and the timers of its
 * set up have run, so that a test does not end or reset it half made.
 */
async function waitForGlass(renderingEngine, glassId) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));

    if (renderingEngine.getViewport(glassId)?.getCurrentImageId?.()) {
      break;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 60));
}

/**
 * Adds a magnifying glass at the centre of the viewport, as a click with the
 * tool does, and gives the id of its viewport.
 */
function addMagnifyingGlass(viewport) {
  const tool = ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(
    AdvancedMagnifyTool.toolName
  );
  const canvas = [200, 150];
  const annotation = tool.addNewAnnotation({
    detail: {
      element: viewport.element,
      currentPoints: { canvas, world: viewport.canvasToWorld(canvas) },
    },
    preventDefault() {},
  });

  return annotation.data.magnifyViewportId;
}

describe('AdvancedMagnifyTool on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let manager;

  /** Adds a glass, waits until it is made and gives its id. */
  async function addGlass(viewport) {
    const glassId = addMagnifyingGlass(viewport);

    await waitForGlass(renderingEngine, glassId);

    return glassId;
  }

  /** Shows an image of the source and waits until the glass followed. */
  async function showImageWithGlass(
    viewport,
    glassId,
    imageIdIndex,
    eventName
  ) {
    await showImage(viewport, imageIdIndex, eventName);
    await waitForGlass(renderingEngine, glassId);
  }

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [AdvancedMagnifyTool],
    });

    renderingEngine = testEnv.renderingEngine;
    manager = testEnv.toolGroups[toolGroupId].getToolInstance(
      AdvancedMagnifyTool.toolName
    ).magnifyViewportManager;
  });

  afterEach(function () {
    manager.dispose();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('makes the magnifying glass again when an image of another size shows in stack mode', async function () {
    const imageIds = [
      ...createStackImageIds().slice(0, 3),
      ...createStackImageIds({ rows: 32, columns: 48 }).slice(3, 6),
    ];
    const viewport = createNextViewport(renderingEngine);

    await showStack(viewport, imageIds);
    await showImage(viewport, 1);

    const glassId = await addGlass(viewport);
    const first = manager.getViewport(glassId);

    await showImageWithGlass(viewport, glassId, 2);

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(manager.getViewport(glassId)).toBe(first);

    await showImageWithGlass(viewport, glassId, 3);

    const second = manager.getViewport(glassId);

    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    await showImageWithGlass(viewport, glassId, 4);

    expect(manager.getViewport(glassId)).toBe(second);

    await showImageWithGlass(viewport, glassId, 0);

    expect(manager.getViewport(glassId)).toBeDefined();
    expect(manager.getViewport(glassId)).not.toBe(second);
  });

  it('makes the magnifying glass again for the first image of another size after it was added', async function () {
    const imageIds = [
      ...createStackImageIds().slice(0, 3),
      ...createStackImageIds({ rows: 32, columns: 48 }).slice(3, 6),
    ];
    const viewport = createNextViewport(renderingEngine);

    await showStack(viewport, imageIds);
    await showImage(viewport, 2);

    const glassId = await addGlass(viewport);
    const first = manager.getViewport(glassId);

    await showImageWithGlass(viewport, glassId, 3);

    expect(manager.getViewport(glassId)).toBeDefined();
    expect(manager.getViewport(glassId)).not.toBe(first);
  });

  it('keeps the magnifying glass on a new slice in volume mode and makes it again for a new volume', async function () {
    const viewport = createNextViewport(renderingEngine);

    await showVolume(viewport, 'magnifyVolumeA');

    const glassId = await addGlass(viewport);
    const first = manager.getViewport(glassId);

    await showImageWithGlass(
      viewport,
      glassId,
      viewport.getCurrentImageIdIndex() + 2,
      Events.VOLUME_NEW_IMAGE
    );

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(manager.getViewport(glassId)).toBe(first);

    await showVolume(viewport, 'magnifyVolumeB');
    await waitForGlass(renderingEngine, glassId);

    expect(manager.getViewport(glassId)).toBeDefined();
    expect(manager.getViewport(glassId)).not.toBe(first);
  });
});
