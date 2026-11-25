import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, displaySetRegistry } = cornerstone3D;
const { annotation, utilities: toolsUtilities } = csTools3d;

const renderingEngineId = utilities.uuidv4();

/**
 * Adds a Length annotation on the slice on display of a viewport, with the
 * view reference of the viewport and two points of that slice, as a tool
 * does, and gives it.
 */
function addLengthAnnotation(viewport, annotationUID) {
  const made = {
    annotationUID,
    highlighted: false,
    invalidated: false,
    isLocked: false,
    isVisible: true,
    metadata: { toolName: 'Length', ...viewport.getViewReference() },
    data: {
      handles: {
        points: [
          viewport.canvasToWorld([150, 120]),
          viewport.canvasToWorld([220, 160]),
        ],
      },
      cachedStats: {},
    },
  };

  annotation.state.addAnnotation(made, viewport.element);

  return made;
}

/** The Length annotations that a viewport shows. */
function shownLengthAnnotations(viewport) {
  const found = annotation.state.getAnnotations('Length', viewport.element);

  return toolsUtilities.planar
    .filterAnnotationsForDisplay(viewport, found || [])
    .map(({ annotationUID }) => annotationUID);
}

/** Scrolls a viewport by `delta` and waits for the image it then shows. */
async function scrollBy(viewport, delta) {
  const before = viewport.getCurrentImageIdIndex();

  await viewport.scroll(delta);
  await waitFor(() => viewport.getCurrentImageIdIndex() === before + delta);
  await renderAndWait(viewport);
}

/**
 * One display set, registered once with its image ids and its volume id,
 * shown as a stack in one planar viewport and as a volume in another under
 * the same display set id (OHIF M42 and M51: the application gave the two
 * mounts two ids, `<uid>::stack` and `<uid>::volume`).
 */
describe('One display set as a stack and as a volume on two direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    annotation.state.removeAllAnnotations();
    displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('mounts one display set id as a stack and as a volume, both scroll, both take an annotation, and a view reference of one is viewable in the other and goes to the same image', async function () {
    const series = await createSeries({ id: 'oneIdBothModes' });
    const displaySetId = 'oneIdBothModes';
    const stack = createNextViewport(renderingEngine, 'oneIdStack');
    const volume = createNextViewport(renderingEngine, 'oneIdVolume');

    displaySetRegistry.add(displaySetId, {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
    await stack.setDisplaySets({
      displaySetId,
      options: { initialImageIdIndex: 2 },
    });
    await volume.setDisplaySets({
      displaySetId,
      options: { mode: 'volume', initialImageIdIndex: 5 },
    });
    await renderAndWait(stack);
    await renderAndWait(volume);

    expect(stack.getCurrentMode()).toBe('stack');
    expect(volume.getCurrentMode()).toBe('volume');
    expect(stack.getSourceDisplaySetId()).toBe(displaySetId);
    expect(volume.getSourceDisplaySetId()).toBe(displaySetId);
    expect(stack.getDisplaySets()).toEqual([
      {
        displaySetId,
        options: { role: 'source', mode: 'stack', initialImageIdIndex: 2 },
      },
    ]);
    expect(volume.getDisplaySets()).toEqual([
      {
        displaySetId,
        options: {
          role: 'source',
          mode: 'volume',
          initialImageIdIndex: 5,
          volumeId: series.volumeId,
        },
      },
    ]);
    expect(stack.getVolumeIds()).toEqual([]);
    expect(volume.getVolumeIds()).toEqual([series.volumeId]);
    expect(stack.getCurrentImageId()).toBe(series.imageIds[2]);
    expect(volume.getCurrentImageId()).toBe(series.imageIds[5]);

    await scrollBy(stack, 1);
    await scrollBy(volume, 1);

    expect(stack.getCurrentImageId()).toBe(series.imageIds[3]);
    expect(volume.getCurrentImageId()).not.toBe(series.imageIds[5]);

    const onStack = addLengthAnnotation(stack, 'oneIdOnStack');
    const onVolume = addLengthAnnotation(volume, 'oneIdOnVolume');

    expect(onStack.metadata.displaySetId).toBe(displaySetId);
    expect(onVolume.metadata.displaySetId).toBe(displaySetId);
    expect(onVolume.metadata.volumeId).toBe(series.volumeId);
    expect(shownLengthAnnotations(stack)).toEqual(['oneIdOnStack']);
    expect(shownLengthAnnotations(volume)).toEqual(['oneIdOnVolume']);

    const stackRef = stack.getViewReference();
    const volumeRef = volume.getViewReference();

    expect(
      volume.isReferenceViewable({ ...stackRef }, { withNavigation: true })
    ).toBe(true);
    expect(
      stack.isReferenceViewable({ ...volumeRef }, { withNavigation: true })
    ).toBe(true);

    const volumeImageId = volume.getCurrentImageId();

    volume.setViewReference(stackRef);
    await renderAndWait(volume);

    expect(volume.getCurrentMode()).toBe('volume');
    expect(volume.getCurrentImageId()).toBe(stack.getCurrentImageId());
    expect(shownLengthAnnotations(volume)).toEqual(['oneIdOnStack']);

    stack.setViewReference(volumeRef);
    await waitFor(() => stack.getCurrentImageId() === volumeImageId);
    await renderAndWait(stack);

    expect(stack.getCurrentMode()).toBe('stack');
    expect(stack.getCurrentImageId()).toBe(volumeImageId);
    expect(shownLengthAnnotations(stack)).toEqual(['oneIdOnVolume']);
  });

  it('keeps the mode of each viewport when the other one mounts the display set again', async function () {
    const series = await createSeries({ id: 'oneIdRemount' });
    const displaySetId = 'oneIdRemount';
    const stack = createNextViewport(renderingEngine, 'oneIdRemountStack');
    const volume = createNextViewport(renderingEngine, 'oneIdRemountVolume');

    displaySetRegistry.add(displaySetId, {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
    await volume.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
    await stack.setDisplaySets({ displaySetId });
    await volume.setDisplaySets({ displaySetId, options: { mode: 'volume' } });
    await stack.setDisplaySets({ displaySetId });
    await renderAndWait(stack);
    await renderAndWait(volume);

    expect(stack.getCurrentMode()).toBe('stack');
    expect(volume.getCurrentMode()).toBe('volume');
    expect(stack.getCurrentImageId()).toBe(series.imageIds[0]);
  });
});
