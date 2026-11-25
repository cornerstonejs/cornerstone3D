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
