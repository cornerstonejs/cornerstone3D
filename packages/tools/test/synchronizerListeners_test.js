import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { startListenerCounts } from '../../../utils/test/listenerCounts';

const { utilities, Enums, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { SynchronizerManager, synchronizers } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'synchronizerListeners';
const ROUNDS = 5;

/** The ids of a stack of three images of the fake image loader. */
function createImageIds(name) {
  return [0, 1, 2].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      rows: 32,
      columns: 32,
      barStart: 4,
      barWidth: 4,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );
}

/** Makes three planar viewports, each with a stack, and gives them. */
async function showStacks(renderingEngine) {
  const viewportIds = ['syncFirst', 'syncSecond', 'syncThird'];

  testUtils.createViewports(
    renderingEngine,
    viewportIds.map((viewportId) => ({
      viewportId,
      viewportType: ViewportType.PLANAR,
      orientation: OrientationAxis.AXIAL,
      width: 200,
      height: 200,
      useEnableElement: true,
    }))
  );

  const viewports = viewportIds.map((viewportId) =>
    renderingEngine.getViewport(viewportId)
  );

  for (const viewport of viewports) {
    await testUtils.setStackOnNextViewport(
      viewport,
      createImageIds(viewport.id)
    );
  }

  return viewports;
}

/**
 * Enables a planar viewport of 200 by 200 pixels with a new element under
 * this id, shows a stack on it and gives it.
 */
async function enableWithStack(renderingEngine, viewportId) {
  const element = document.createElement('div');

  element.style.width = '200px';
  element.style.height = '200px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: { orientation: OrientationAxis.AXIAL },
  });

  const viewport = renderingEngine.getViewport(viewportId);

  await testUtils.setStackOnNextViewport(viewport, createImageIds(viewportId));

  return viewport;
}

/**
 * Zooms a viewport and gives the number of CAMERA_MODIFIED events that the
 * other viewport fired meanwhile: one when the synchronizer wrote it.
 */
function writesOfZoom(viewport, other) {
  let writes = 0;
  const listener = () => {
    writes += 1;
  };

  other.element.addEventListener(Events.CAMERA_MODIFIED, listener);
  viewport.setZoom(viewport.getZoom() * 1.5);
  other.element.removeEventListener(Events.CAMERA_MODIFIED, listener);

  return writes;
}

/** The viewport ids of a viewport, as a synchronizer takes them. */
function idsOf(viewport) {
  return { renderingEngineId, viewportId: viewport.id };
}

/** The sum of the counts of several elements, by event type. */
function sumOfElements(counts, elements) {
  const sum = {};

  elements.forEach((element) => {
    Object.entries(counts.onElement(element)).forEach(([type, count]) => {
      sum[type] = (sum[type] ?? 0) + count;
    });
  });

  return sum;
}

describe('The listeners of a synchronizer -- ', () => {
  let renderingEngine;
  let counts;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
    counts = startListenerCounts(eventTarget);
  });

  afterEach(function () {
    counts.stop();
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId, toolGroupIds: [] });
  });

  it('adds one ELEMENT_DISABLED listener, on eventTarget, while it has viewports, and none on the elements, as viewports come and go', async function () {
    const [first, second, third] = await showStacks(renderingEngine);
    const before = counts.onEventTarget(Events.ELEMENT_DISABLED);
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);

    synchronizer.add(idsOf(first));
    synchronizer.add(idsOf(second));

    const firstBeforeThird = counts.onElement(
      first.element,
      Events.ELEMENT_DISABLED
    );

    synchronizer.add(idsOf(third));

    expect(firstBeforeThird).toBe(0);
    expect(counts.onElement(first.element, Events.ELEMENT_DISABLED)).toBe(0);
    expect(counts.onEventTarget(Events.ELEMENT_DISABLED)).toBe(before + 1);

    [first, second, third].forEach((viewport) =>
      synchronizer.remove(idsOf(viewport))
    );

    expect(counts.onEventTarget(Events.ELEMENT_DISABLED)).toBe(before);
  });

  it('leaves no listener after five rounds of adds, removes and a destroy', async function () {
    const viewports = await showStacks(renderingEngine);
    const elements = viewports.map(({ element }) => element);
    const eventTargetBefore = counts.onEventTarget();
    const elementsBefore = sumOfElements(counts, elements);

    for (let round = 0; round < ROUNDS; round++) {
      const synchronizer =
        synchronizers.createCameraPositionSynchronizer(synchronizerId);

      viewports.forEach((viewport) => synchronizer.add(idsOf(viewport)));
      viewports.forEach((viewport) => synchronizer.remove(idsOf(viewport)));
      viewports.forEach((viewport) => synchronizer.add(idsOf(viewport)));
      SynchronizerManager.destroySynchronizer(synchronizerId);
    }

    expect(counts.onEventTarget()).toEqual(eventTargetBefore);
    expect(sumOfElements(counts, elements)).toEqual(elementsBefore);
  });

  it('removes the listener of its event from every source element when it is destroyed', async function () {
    const viewports = await showStacks(renderingEngine);
    const cameraListeners = () =>
      viewports.map((viewport) =>
        counts.onElement(viewport.element, Events.CAMERA_MODIFIED)
      );
    const before = cameraListeners();
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);

    viewports.forEach((viewport) => synchronizer.add(idsOf(viewport)));

    expect(cameraListeners()).toEqual(before.map((count) => count + 1));

    synchronizer.destroy();

    expect(cameraListeners()).toEqual(before);
    expect(synchronizer.getSourceViewports()).toEqual([]);
    expect(synchronizer.getTargetViewports()).toEqual([]);
  });

  it('makes a viewport added before it is enabled a source and a target at its enable, as one added after it (row 316)', async function () {
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);
    const enabledBefore = counts.onEventTarget(Events.ELEMENT_ENABLED);

    synchronizer.add({ renderingEngineId, viewportId: 'syncFirst' });

    expect(counts.onEventTarget(Events.ELEMENT_ENABLED)).toBe(
      enabledBefore + 1
    );

    const first = await enableWithStack(renderingEngine, 'syncFirst');
    const second = await enableWithStack(renderingEngine, 'syncSecond');
    const control = await enableWithStack(renderingEngine, 'syncThird');
    const cameraListeners = (viewport) =>
      counts.onElement(viewport.element, Events.CAMERA_MODIFIED) -
      counts.onElement(control.element, Events.CAMERA_MODIFIED);

    synchronizer.add(idsOf(second));

    expect(counts.onEventTarget(Events.ELEMENT_ENABLED)).toBe(enabledBefore);
    expect(cameraListeners(first)).toBe(1);
    expect(cameraListeners(second)).toBe(1);
    expect(synchronizer.getSourceViewports()).toEqual([
      idsOf(first),
      idsOf(second),
    ]);
    expect(writesOfZoom(first, second)).toBe(1);
    expect(writesOfZoom(second, first)).toBe(1);
  });

  it('leaves no listener when a viewport that was never enabled is removed', function () {
    const before = counts.onEventTarget();
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);

    synchronizer.add({ renderingEngineId, viewportId: 'neverEnabled' });
    synchronizer.remove({ renderingEngineId, viewportId: 'neverEnabled' });

    expect(counts.onEventTarget()).toEqual(before);
    expect(synchronizer.getSourceViewports()).toEqual([]);
  });

  it('listens to the new element of a viewport that is disabled and enabled again under the same id, and to no element of it before', async function () {
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);
    const first = await enableWithStack(renderingEngine, 'syncFirst');
    const second = await enableWithStack(renderingEngine, 'syncSecond');
    const control = await enableWithStack(renderingEngine, 'syncThird');
    const oldElement = first.element;

    synchronizer.add(idsOf(first));
    synchronizer.add(idsOf(second));
    renderingEngine.disableElement(first.id);

    expect(synchronizer.getSourceViewports()).toEqual([idsOf(second)]);
    expect(counts.onElement(oldElement, Events.CAMERA_MODIFIED)).toBe(0);

    synchronizer.add(idsOf(first));

    const again = await enableWithStack(renderingEngine, 'syncFirst');

    expect(again.element).not.toBe(oldElement);
    expect(counts.onElement(oldElement, Events.CAMERA_MODIFIED)).toBe(0);
    expect(
      counts.onElement(again.element, Events.CAMERA_MODIFIED) -
        counts.onElement(control.element, Events.CAMERA_MODIFIED)
    ).toBe(1);
    expect(writesOfZoom(again, second)).toBe(1);
    expect(writesOfZoom(second, again)).toBe(1);
  });

  it('takes out a viewport that is only a target when its element is disabled', async function () {
    const [first, second] = await showStacks(renderingEngine);
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);

    synchronizer.addTarget(idsOf(first));
    synchronizer.addTarget(idsOf(second));
    renderingEngine.disableElement(first.id);

    expect(synchronizer.getTargetViewports()).toEqual([idsOf(second)]);
  });
});
