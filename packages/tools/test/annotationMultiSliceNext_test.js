import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, getConfiguration, cache } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { AnnotationMultiSlice } = csTools3d.utilities;

const renderingEngineId = utilities.uuidv4();
const SLICES = 12;

/** Enables one viewport of a type, as the legacy class or as a next class. */
function enableViewport(renderingEngine, viewportId, viewportType, generic) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;

  rendering.useGenericViewport = generic;
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType,
    orientation: OrientationAxis.AXIAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });
  rendering.useGenericViewport = useGenericViewport;

  return renderingEngine.getViewport(viewportId);
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

/**
 * Makes and caches a volume of the fake volume loader. Its image ids are
 * images of the fake image loader, so the same series also shows as a stack.
 */
async function createSeries() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'multiSliceSeries',
    rows: 32,
    columns: 32,
    slices: SLICES,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return { volumeId, imageIds: cache.getVolume(volumeId).imageIds };
}

/** Shows the series as a stack on a direct next planar viewport. */
async function showNextStack(viewport, imageIds) {
  const displaySetId = `stack:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION },
  });
  await renderAndWait(viewport);
}

/** Shows the series as a volume on a direct next planar viewport. */
async function showNextVolume(viewport, volumeId, imageIds) {
  const displaySetId = `volume:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL },
  });
  await renderAndWait(viewport);
}

/** Goes to a slice of the viewport and waits until it shows it. */
async function goToSlice(viewport, imageIndex) {
  await utilities.jumpToSlice(viewport.element, { imageIndex });
  await renderAndWait(viewport);

  expect(viewport.getCurrentImageIdIndex()).toBe(imageIndex);
}

/**
 * An annotation of the slice that the viewport shows, with the view
 * reference of the viewport and without its plane restriction. A planar
 * next viewport answers a reference with a plane restriction by the plane
 * alone, on its legacy adapter too, so such a reference shows on one slice.
 */
function createAnnotation(viewport) {
  const { planeRestriction: _planeRestriction, ...viewReference } =
    viewport.getViewReference();

  return {
    annotationUID: utilities.uuidv4(),
    metadata: { ...viewReference, toolName: 'test' },
    data: {},
  };
}

/**
 * Sets ranges of an annotation with AnnotationMultiSlice and gives what the
 * annotation then says: the range after each call, the slice indices and
 * the images of its first range, and the slices that show the annotation of
 * the range of slices 3 to 9.
 */
async function setRanges(viewport) {
  await goToSlice(viewport, 2);

  const annotation = createAnnotation(viewport);
  const result = { viewable: {} };

  AnnotationMultiSlice.setRange(viewport, annotation, 2, 8);
  result.range = AnnotationMultiSlice.getFrameRange(annotation);
  result.sliceIndex = annotation.metadata.sliceIndex;
  result.rangeEndSliceIndex =
    annotation.metadata.multiSliceReference.sliceIndex;
  result.referencedImageId = annotation.metadata.referencedImageId;
  result.rangeEndImageId =
    annotation.metadata.multiSliceReference.referencedImageId;

  for (const imageIndex of [1, 2, 5, 8, 9]) {
    await goToSlice(viewport, imageIndex);
    result.viewable[imageIndex] = viewport.isReferenceViewable(
      annotation.metadata
    );
  }

  AnnotationMultiSlice.setStartRange(viewport, annotation, 4);
  result.afterStart = AnnotationMultiSlice.getFrameRange(annotation);

  AnnotationMultiSlice.setEndRange(viewport, annotation, 6);
  result.afterEnd = AnnotationMultiSlice.getFrameRange(annotation);

  AnnotationMultiSlice.setSingle(viewport, annotation, 6);
  result.single = AnnotationMultiSlice.getFrameRange(annotation);
  result.singleReference = annotation.metadata.multiSliceReference;

  return result;
}

describe('AnnotationMultiSlice on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let series;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    series = await createSeries();
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('sets a range of images of a stack, as on the legacy stack viewport and on its adapter', async function () {
    const { imageIds } = series;
    const legacy = enableViewport(
      renderingEngine,
      'legacyStack',
      ViewportType.STACK,
      false
    );
    const adapter = enableViewport(
      renderingEngine,
      'adapterStack',
      ViewportType.STACK,
      true
    );
    const next = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR_NEXT,
      true
    );

    await legacy.setStack(imageIds, 0);
    await renderAndWait(legacy);
    await adapter.setStack(imageIds, 0);
    await renderAndWait(adapter);
    await showNextStack(next, imageIds);

    expect(next.getCurrentMode()).toBe('stack');
    expect(next.getSliceIndexForImage).toBeUndefined();

    const legacyResult = await setRanges(legacy);
    const adapterResult = await setRanges(adapter);
    const nextResult = await setRanges(next);

    expect(nextResult).toEqual({
      range: [3, 9],
      sliceIndex: 2,
      rangeEndSliceIndex: 8,
      referencedImageId: imageIds[2],
      rangeEndImageId: imageIds[8],
      viewable: { 1: false, 2: true, 5: true, 8: true, 9: false },
      afterStart: [5, 9],
      afterEnd: [5, 7],
      single: 7,
      singleReference: undefined,
    });
    expect(nextResult).toEqual(legacyResult);
    expect(adapterResult).toEqual(legacyResult);
  });

  it('sets a range of slices of a volume in its acquisition orientation, with the ranges of the same series as a stack', async function () {
    const { imageIds, volumeId } = series;
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR_NEXT,
      true
    );
    const volume = enableViewport(
      renderingEngine,
      'nextVolume',
      ViewportType.PLANAR_NEXT,
      true
    );

    await showNextStack(stack, imageIds);
    await showNextVolume(volume, volumeId, imageIds);

    expect(stack.getCurrentMode()).toBe('stack');
    expect(volume.getCurrentMode()).toBe('volume');
    expect(volume.getSliceIndexForImage).toBeUndefined();

    const stackResult = await setRanges(stack);
    const volumeResult = await setRanges(volume);
    const rangeOf = ({
      range,
      sliceIndex,
      rangeEndSliceIndex,
      afterStart,
      afterEnd,
      single,
      singleReference,
    }) => ({
      range,
      sliceIndex,
      rangeEndSliceIndex,
      afterStart,
      afterEnd,
      single,
      singleReference,
    });

    expect(rangeOf(volumeResult)).toEqual({
      range: [3, 9],
      sliceIndex: 2,
      rangeEndSliceIndex: 8,
      afterStart: [5, 9],
      afterEnd: [5, 7],
      single: 7,
      singleReference: undefined,
    });
    expect(rangeOf(volumeResult)).toEqual(rangeOf(stackResult));
    expect(volumeResult.referencedImageId).toBe(
      volume.getViewReference({ sliceIndex: 2 }).referencedImageId
    );
    expect(volumeResult.rangeEndImageId).toBe(
      volume.getViewReference({ sliceIndex: 8 }).referencedImageId
    );
    expect(imageIds).toContain(volumeResult.referencedImageId);
    expect(imageIds).toContain(volumeResult.rangeEndImageId);
  });
});
