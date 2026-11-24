import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;
const { AnnotationMultiSlice } = csTools3d.utilities;
const { filterAnnotationsForDisplay } = csTools3d.utilities.planar;
const { ProbeTool } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const SLICES = 12;

/** Enables one viewport of a type. */
function enableViewport(renderingEngine, viewportId, viewportType) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType,
    orientation: OrientationAxis.AXIAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });

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

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION },
  });
  await renderAndWait(viewport);
}

/** Shows the series as a volume on a direct next planar viewport. */
async function showNextVolume(
  viewport,
  volumeId,
  imageIds,
  orientation = OrientationAxis.AXIAL
) {
  const displaySetId = `volume:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation },
  });
  await renderAndWait(viewport);
}

/**
 * Makes the annotation of a probe at the centre of a slice, as the probe
 * tool makes it, and gives it a range of slices of the viewport.
 */
async function createToolAnnotationWithRange(viewport, start, end) {
  await goToSlice(viewport, start);

  const annotation = ProbeTool.createAnnotationForViewport(viewport, {
    data: { handles: { points: [viewport.canvasToWorld([150, 150])] } },
  });

  AnnotationMultiSlice.setRange(viewport, annotation, start, end);

  return annotation;
}

/**
 * Gives an annotation the frame of reference of a viewport. The fake image
 * loader and the fake volume loader give the one series of these tests two
 * frames of reference, where a DICOM series has one, so an annotation made on
 * the stack names another frame of reference than the volume.
 */
function inFrameOfReferenceOf(annotation, viewport) {
  annotation.metadata.FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

  return annotation;
}

/**
 * The slices of a viewport on which the tools draw an annotation, and the
 * index among the images of the series of the image that each slice shows.
 */
async function drawnOnSlices(viewport, annotation, sliceIndices, imageIds) {
  const drawn = {};
  const images = {};

  for (const sliceIndex of sliceIndices) {
    await goToSlice(viewport, sliceIndex);
    drawn[sliceIndex] =
      filterAnnotationsForDisplay(viewport, [annotation]).length === 1;
    images[sliceIndex] = imageIds.indexOf(viewport.getCurrentImageId());
  }

  return { drawn, images };
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
 * alone, so such a reference shows on one slice.
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

/**
 * Makes the annotation of a probe on slice 2 as the probe tool makes it,
 * with the whole view reference of the viewport and so with its plane
 * restriction, gives it the range of slices 2 to 8, and says on which slices
 * the viewport calls its reference viewable and on which the tools draw it.
 */
async function rangeOfToolAnnotation(viewport) {
  await goToSlice(viewport, 2);

  const annotation = ProbeTool.createAnnotationForViewport(viewport, {
    data: { handles: { points: [viewport.canvasToWorld([150, 150])] } },
  });
  const result = {
    hasPlaneRestriction: Boolean(annotation.metadata.planeRestriction),
    viewable: {},
    drawn: {},
  };

  AnnotationMultiSlice.setRange(viewport, annotation, 2, 8);

  for (const imageIndex of [1, 2, 5, 8, 9]) {
    await goToSlice(viewport, imageIndex);
    result.viewable[imageIndex] = viewport.isReferenceViewable(
      annotation.metadata
    );
    result.drawn[imageIndex] =
      filterAnnotationsForDisplay(viewport, [annotation]).length === 1;
  }

  return result;
}

/**
 * What `setRanges` gave on the legacy stack viewport for a stack of these
 * images: the image of slice 2 and the image of slice 8, the ranges as frame
 * numbers from 1.
 */
function legacyStackRanges(imageIds) {
  return {
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
  };
}

/**
 * What `rangeOfToolAnnotation` gave on the legacy stack viewport: the
 * annotation of the tool has a plane restriction, and the viewport calls it
 * viewable and the tools draw it on the slices 2 to 8.
 */
const LEGACY_STACK_TOOL_ANNOTATION_RANGE = {
  hasPlaneRestriction: true,
  viewable: { 1: false, 2: true, 5: true, 8: true, 9: false },
  drawn: { 1: false, 2: true, 5: true, 8: true, 9: false },
};

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

  it('sets a range of images of a stack, as on the legacy stack viewport', async function () {
    const { imageIds } = series;
    const next = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );

    await showNextStack(next, imageIds);

    expect(next.getCurrentMode()).toBe('stack');
    expect(next.getSliceIndexForImage).toBeUndefined();

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
    expect(nextResult).toEqual(legacyStackRanges(imageIds));
  });

  it('sets a range of slices of a volume in its acquisition orientation, with the ranges of the same series as a stack', async function () {
    const { imageIds, volumeId } = series;
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );
    const volume = enableViewport(
      renderingEngine,
      'nextVolume',
      ViewportType.PLANAR,
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

  it('shows the annotation of a tool, which has a plane restriction, on its range of images in stack mode, as the legacy stack viewport', async function () {
    const { imageIds } = series;
    const next = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );

    await showNextStack(next, imageIds);

    const nextResult = await rangeOfToolAnnotation(next);
    const onTheRange = { 1: false, 2: true, 5: true, 8: true, 9: false };

    expect(next.getCurrentMode()).toBe('stack');
    expect(nextResult).toEqual({
      hasPlaneRestriction: true,
      viewable: onTheRange,
      drawn: onTheRange,
    });
    expect(LEGACY_STACK_TOOL_ANNOTATION_RANGE).toEqual(nextResult);
  });

  it('calls the reference of a tool annotation with a plane restriction viewable on its range of slices in volume mode, and the tools draw it there, as the same series does as a stack', async function () {
    const { imageIds, volumeId } = series;
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );
    const volume = enableViewport(
      renderingEngine,
      'nextVolume',
      ViewportType.PLANAR,
      true
    );

    await showNextStack(stack, imageIds);
    await showNextVolume(volume, volumeId, imageIds);

    const stackResult = await rangeOfToolAnnotation(stack);
    const volumeResult = await rangeOfToolAnnotation(volume);

    expect(volume.getCurrentMode()).toBe('volume');
    expect(volumeResult.hasPlaneRestriction).toBe(true);
    expect(volumeResult.viewable).toEqual({
      1: false,
      2: true,
      5: true,
      8: true,
      9: false,
    });
    expect(volumeResult.viewable).toEqual(stackResult.viewable);
    expect(volumeResult.drawn).toEqual({
      1: false,
      2: true,
      5: true,
      8: true,
      9: false,
    });
    expect(volumeResult.drawn).toEqual(stackResult.drawn);
  });

  it('draws the annotation that a stack gave a range of images on the slices of the volume that show those images', async function () {
    const { imageIds, volumeId } = series;
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );
    const volume = enableViewport(
      renderingEngine,
      'nextVolume',
      ViewportType.PLANAR,
      true
    );

    await showNextStack(stack, imageIds);
    await showNextVolume(volume, volumeId, imageIds);

    const annotation = inFrameOfReferenceOf(
      await createToolAnnotationWithRange(stack, 2, 8),
      volume
    );
    const result = await drawnOnSlices(
      volume,
      annotation,
      [1, 2, 3, 6, 9, 10],
      imageIds
    );

    expect(volume.getCurrentMode()).toBe('volume');
    expect(result.images).toEqual({ 1: 10, 2: 9, 3: 8, 6: 5, 9: 2, 10: 1 });
    expect(result.drawn).toEqual({
      1: false,
      2: false,
      3: true,
      6: true,
      9: true,
      10: false,
    });
  });

  it('draws the annotation of a range of sagittal slices on those slices of the volume, and not in another plane or on the stack', async function () {
    const { imageIds, volumeId } = series;
    const sagittal = enableViewport(
      renderingEngine,
      'nextSagittal',
      ViewportType.PLANAR,
      true
    );
    const axial = enableViewport(
      renderingEngine,
      'nextAxial',
      ViewportType.PLANAR,
      true
    );
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );

    await showNextVolume(
      sagittal,
      volumeId,
      imageIds,
      OrientationAxis.SAGITTAL
    );
    await showNextVolume(axial, volumeId, imageIds);
    await showNextStack(stack, imageIds);

    const annotation = await createToolAnnotationWithRange(sagittal, 10, 20);

    expect(annotation.metadata.referencedImageId).toBeUndefined();
    expect(annotation.metadata.multiSliceReference.sliceIndex).toBe(20);
    expect(AnnotationMultiSlice.getFrameRange(annotation)).toEqual([11, 21]);

    const onSagittal = await drawnOnSlices(
      sagittal,
      annotation,
      [9, 10, 15, 20, 21],
      imageIds
    );
    const onAxial = await drawnOnSlices(axial, annotation, [2, 5, 9], imageIds);
    const onStack = await drawnOnSlices(
      stack,
      inFrameOfReferenceOf(
        { ...annotation, metadata: { ...annotation.metadata } },
        stack
      ),
      [2, 5, 9],
      imageIds
    );

    expect(onSagittal.drawn).toEqual({
      9: false,
      10: true,
      15: true,
      20: true,
      21: false,
    });
    expect(onAxial.drawn).toEqual({ 2: false, 5: false, 9: false });
    expect(onStack.drawn).toEqual({ 2: false, 5: false, 9: false });
  });

  it('calls a reference to one image viewable on the slice that shows the image, in stack mode and in volume mode where the slices run against the order of the images', async function () {
    const { imageIds, volumeId } = series;
    const stack = enableViewport(
      renderingEngine,
      'nextStack',
      ViewportType.PLANAR,
      true
    );
    const volume = enableViewport(
      renderingEngine,
      'nextVolume',
      ViewportType.PLANAR,
      true
    );

    await showNextStack(stack, imageIds);
    await showNextVolume(volume, volumeId, imageIds);

    for (const viewport of [stack, volume]) {
      const shown = {};

      for (const imageIndex of [2, 9]) {
        await goToSlice(viewport, imageIndex);

        const { FrameOfReferenceUID, viewPlaneNormal } =
          viewport.getViewReference();
        const imageIdOnDisplay = viewport.getCurrentImageId();

        shown[imageIndex] = imageIds.indexOf(imageIdOnDisplay);
        expect(
          viewport.isReferenceViewable({
            FrameOfReferenceUID,
            viewPlaneNormal,
            referencedImageId: imageIdOnDisplay,
          })
        ).toBe(true);
        expect(
          viewport.isReferenceViewable({
            FrameOfReferenceUID,
            viewPlaneNormal,
            referencedImageId: imageIds[imageIndex === 2 ? 5 : 6],
          })
        ).toBe(false);
      }

      expect(shown).toEqual(
        viewport === stack ? { 2: 2, 9: 9 } : { 2: 9, 9: 2 }
      );
    }
  });
});
