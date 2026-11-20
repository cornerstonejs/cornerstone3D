import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  renderAndWait,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, imageLoader, volumeLoader, Enums } = cornerstone3D;
const { OrientationAxis } = Enums;
const { annotation, utilities: toolsUtilities } = csTools3d;

const renderingEngineId = utilities.uuidv4();

/** Six images of the fake image loader, which gives no frame of reference. */
function imageIdsOf(name) {
  return Array.from({ length: 6 }, (_, sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name,
      rows: 64,
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
 * The name that a planar viewport made up for images without a frame of
 * reference before the name took a SHA-256 digest: the FNV-1a hash of their
 * sorted URIs, joined by new lines.
 */
function earlierFrameOfReferenceOf(imageIds) {
  const imageURIs = [...new Set(imageIds.map(utilities.imageIdToURI))].sort();

  return `noFrameOfReference-${imageURIs.length}-${utilities.fnv1aHash(
    imageURIs.join('\n')
  )}`;
}

/** The answers of `isReferenceViewable` without options and with navigation. */
function answers(viewport, viewRef) {
  return {
    plain: viewport.isReferenceViewable({ ...viewRef }),
    withNavigation: viewport.isReferenceViewable(
      { ...viewRef },
      { withNavigation: true }
    ),
  };
}

/** Shows a stack display set at an image. */
async function showStackAt(viewport, displaySetId, imageIds, imageIdIndex) {
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);
  viewport.setViewState({ slice: { kind: 'stackIndex', imageIdIndex } });
  await waitFor(() => viewport.getCurrentImageId() === imageIds[imageIdIndex]);
  await renderAndWait(viewport);
}

/** Registers a stack display set of image ids. */
function registerStack(displaySetId, imageIds) {
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
}

/**
 * Adds a Length annotation on the image on display of a viewport, with the
 * view reference of the viewport, as a tool does, and gives it.
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
          [10, 10, 0],
          [20, 20, 0],
        ],
      },
      cachedStats: {},
    },
  };

  annotation.state.addAnnotation(made, viewport.element);

  return made;
}

/** The Length annotations of a viewport, and the ones that it shows. */
function lengthAnnotationsOf(viewport) {
  const found = annotation.state.getAnnotations('Length', viewport.element);

  return {
    found: (found || []).map(({ annotationUID }) => annotationUID),
    shown: toolsUtilities.planar
      .filterAnnotationsForDisplay(viewport, found || [])
      .map(({ annotationUID }) => annotationUID),
  };
}

/**
 * Images without a frame of reference. The legacy stack and volume viewports
 * of commit 58914567b gave no frame of reference for them, so every viewport
 * took the view reference of another by the image that it names, and the
 * annotations of all such images were in one group and showed on the
 * viewports that show their image: the values that the tests state. A planar
 * viewport makes up the frame of reference of the images, so every viewport
 * and every display set of the same images has the same one; other images
 * have another one, so their annotations are in another group.
 */
describe('Images without a frame of reference on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    annotation.state.removeAllAnnotations();
    utilities.genericViewportDisplaySetMetadataProvider.clear();
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('gives the viewports of the same images one frame of reference in stack mode, so each takes the view references and the annotations of the others', async function () {
    const imageIds = imageIdsOf('noFrameStack');
    const otherIds = imageIdsOf('noFrameStackOther');
    const first = createNextViewport(renderingEngine, 'noFrameFirst');
    const same = createNextViewport(renderingEngine, 'noFrameSame');
    const copy = createNextViewport(renderingEngine, 'noFrameCopy');
    const other = createNextViewport(renderingEngine, 'noFrameOther');

    registerStack('noFrame:one', imageIds);
    registerStack('noFrame:two', imageIds);
    registerStack('noFrame:other', otherIds);
    await showStackAt(first, 'noFrame:one', imageIds, 3);
    await showStackAt(same, 'noFrame:one', imageIds, 1);
    await showStackAt(copy, 'noFrame:two', imageIds, 1);
    await showStackAt(other, 'noFrame:other', otherIds, 3);

    const firstRef = first.getViewReference();

    expect(same.getFrameOfReferenceUID()).toBe(first.getFrameOfReferenceUID());
    expect(copy.getFrameOfReferenceUID()).toBe(first.getFrameOfReferenceUID());
    expect(other.getFrameOfReferenceUID()).not.toBe(
      first.getFrameOfReferenceUID()
    );
    expect(firstRef.referencedImageId).toBe(imageIds[3]);
    expect(answers(same, firstRef)).toEqual({
      plain: false,
      withNavigation: true,
    });
    expect(answers(copy, firstRef)).toEqual({
      plain: false,
      withNavigation: true,
    });
    expect(answers(other, firstRef)).toEqual({
      plain: false,
      withNavigation: false,
    });

    same.setViewReference(firstRef);
    copy.setViewReference(firstRef);
    await renderAndWait(same);
    await renderAndWait(copy);

    expect(same.getCurrentImageIdIndex()).toBe(3);
    expect(copy.getCurrentImageIdIndex()).toBe(3);
    expect(answers(same, firstRef)).toEqual({
      plain: true,
      withNavigation: true,
    });
    expect(answers(first, copy.getViewReference())).toEqual({
      plain: true,
      withNavigation: true,
    });

    addLengthAnnotation(first, 'noFrameStackLength');

    expect(lengthAnnotationsOf(same)).toEqual({
      found: ['noFrameStackLength'],
      shown: ['noFrameStackLength'],
    });
    expect(lengthAnnotationsOf(copy)).toEqual({
      found: ['noFrameStackLength'],
      shown: ['noFrameStackLength'],
    });
    expect(lengthAnnotationsOf(other)).toEqual({ found: [], shown: [] });
  });

  it('gives a volume of the same images the frame of reference of the stack, so each takes the view references and the annotations of the other', async function () {
    const imageIds = imageIdsOf('noFrameVolume');
    const volumeId = 'noFrameOfReferenceVolume';
    const stack = createNextViewport(renderingEngine, 'noFrameStack');
    const volume = createNextViewport(renderingEngine, 'noFrameVolume');

    await Promise.all(
      imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
    );
    volumeLoader.createAndCacheVolumeFromImagesSync(volumeId, imageIds);
    registerStack('noFrame:stack', imageIds);
    utilities.genericViewportDisplaySetMetadataProvider.add('noFrame:volume', {
      imageIds,
      volumeId,
    });
    await showStackAt(stack, 'noFrame:stack', imageIds, 3);
    await volume.setDisplaySets({
      displaySetId: 'noFrame:volume',
      options: { orientation: OrientationAxis.ACQUISITION },
    });
    await renderAndWait(volume);

    const stackRef = stack.getViewReference();

    expect(volume.getCurrentMode()).toBe('volume');
    expect(volume.getFrameOfReferenceUID()).toBe(
      stack.getFrameOfReferenceUID()
    );
    expect(answers(volume, stackRef).withNavigation).toBe(true);

    volume.setViewReference(stackRef);
    await renderAndWait(volume);

    expect(volume.getCurrentImageId()).toBe(imageIds[3]);
    expect(answers(volume, stackRef)).toEqual({
      plain: true,
      withNavigation: true,
    });
    expect(answers(stack, volume.getViewReference())).toEqual({
      plain: true,
      withNavigation: true,
    });

    addLengthAnnotation(stack, 'noFrameVolumeLength');

    expect(lengthAnnotationsOf(volume)).toEqual({
      found: ['noFrameVolumeLength'],
      shown: ['noFrameVolumeLength'],
    });
  });

  it('takes a view reference saved with the name made up for its images before the SHA-256 digest, by the image that it names, on a stack and on a volume', async function () {
    const imageIds = imageIdsOf('noFrameEarlier');
    const otherIds = imageIdsOf('noFrameEarlierOther');
    const volumeId = 'noFrameEarlierVolume';
    const stack = createNextViewport(renderingEngine, 'noFrameEarlierStack');
    const volume = createNextViewport(renderingEngine, 'noFrameEarlierVolume');

    await Promise.all(
      imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
    );
    volumeLoader.createAndCacheVolumeFromImagesSync(volumeId, imageIds);
    registerStack('noFrame:earlier', imageIds);
    utilities.genericViewportDisplaySetMetadataProvider.add(
      'noFrame:earlierVolume',
      { imageIds, volumeId }
    );
    await showStackAt(stack, 'noFrame:earlier', imageIds, 4);

    const saved = {
      ...stack.getViewReference(),
      FrameOfReferenceUID: earlierFrameOfReferenceOf(imageIds),
    };
    const savedOfOtherImages = {
      ...saved,
      FrameOfReferenceUID: earlierFrameOfReferenceOf(otherIds),
    };

    await showStackAt(stack, 'noFrame:earlier', imageIds, 1);
    await volume.setDisplaySets({
      displaySetId: 'noFrame:earlierVolume',
      options: { orientation: OrientationAxis.ACQUISITION },
    });
    await renderAndWait(volume);

    expect(saved.FrameOfReferenceUID).not.toBe(stack.getFrameOfReferenceUID());
    expect(saved.referencedImageId).toBe(imageIds[4]);
    expect(answers(stack, saved).withNavigation).toBe(true);
    expect(answers(volume, saved).withNavigation).toBe(true);
    expect(answers(stack, savedOfOtherImages).withNavigation).toBe(false);

    stack.setViewReference(savedOfOtherImages);
    await renderAndWait(stack);

    expect(stack.getCurrentImageIdIndex()).toBe(1);

    stack.setViewReference(saved);
    volume.setViewReference(saved);
    await renderAndWait(stack);
    await renderAndWait(volume);

    expect(stack.getCurrentImageIdIndex()).toBe(4);
    expect(volume.getCurrentImageId()).toBe(imageIds[4]);
  });
});
