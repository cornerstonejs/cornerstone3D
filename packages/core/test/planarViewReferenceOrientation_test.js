import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The answers of `isReferenceViewable` without options, with navigation,
 * with orientation, and with both.
 */
function answers(viewport, viewRef) {
  return {
    plain: viewport.isReferenceViewable({ ...viewRef }),
    withNavigation: viewport.isReferenceViewable(
      { ...viewRef },
      { withNavigation: true }
    ),
    withOrientation: viewport.isReferenceViewable(
      { ...viewRef },
      { withOrientation: true }
    ),
    withOrientationAndNavigation: viewport.isReferenceViewable(
      { ...viewRef },
      { withOrientation: true, withNavigation: true }
    ),
  };
}

/**
 * The answers of `isReferenceViewable` with `asVolume`, alone, with
 * navigation, with orientation, and with both.
 */
function answersAsVolume(viewport, viewRef) {
  return {
    asVolume: viewport.isReferenceViewable({ ...viewRef }, { asVolume: true }),
    withNavigation: viewport.isReferenceViewable(
      { ...viewRef },
      { asVolume: true, withNavigation: true }
    ),
    withOrientation: viewport.isReferenceViewable(
      { ...viewRef },
      { asVolume: true, withOrientation: true }
    ),
    withOrientationAndNavigation: viewport.isReferenceViewable(
      { ...viewRef },
      { asVolume: true, withOrientation: true, withNavigation: true }
    ),
  };
}

/** Moves a viewport in volume mode to the slice through a world point. */
async function moveTo(viewport, point) {
  viewport.setViewState({
    slice: { kind: 'volumePoint', sliceWorldPoint: point },
  });
  await renderAndWait(viewport);
}

/**
 * Shows the volume of a series in sagittal and in axial on two viewports of
 * one display set. The sagittal one gives its references at the slices 16 and
 * 4 of its 32, and the axial one stays at its slice 4 of 8.
 */
async function showSagittalAndAxial(renderingEngine, id) {
  const series = await createSeries({ id });
  const sagittal = createNextViewport(renderingEngine, 'orientationSagittal');
  const axial = createNextViewport(renderingEngine, 'orientationAxial');

  await showVolume(sagittal, series, 3, {
    orientation: OrientationAxis.SAGITTAL,
  });
  await moveTo(sagittal, worldOfVoxel(series, [16, 12, 3]));
  const sagittalRef16 = sagittal.getViewReference();
  await moveTo(sagittal, worldOfVoxel(series, [4, 12, 3]));
  const sagittalRef4 = sagittal.getViewReference();

  await axial.setDisplaySets({
    displaySetId: sagittalRef16.dataId,
    options: { orientation: OrientationAxis.AXIAL },
  });
  await renderAndWait(axial);
  await moveTo(axial, worldOfVoxel(series, [16, 12, 3]));

  return { series, sagittal, axial, sagittalRef16, sagittalRef4 };
}

/**
 * The legacy volume viewport of commit 58914567b, in the same scene, gave the
 * answers that the tests state.
 */
describe('A view reference of another orientation of a volume on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('takes a reference of another plane of its volume with orientation and navigation whatever the slice index of the reference', async function () {
    const { axial, sagittalRef16, sagittalRef4 } = await showSagittalAndAxial(
      renderingEngine,
      'orientation-other-plane'
    );

    expect(sagittalRef16.sliceIndex).toBe(16);
    expect(sagittalRef4.sliceIndex).toBe(4);
    expect(axial.getSliceIndex()).toBe(4);
    expect(axial.getNumberOfSlices()).toBe(8);
    expect(answers(axial, sagittalRef16)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: true,
    });
    expect(answers(axial, sagittalRef4)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
  });

  it('takes a reference of its volume that names another display set id as a reference of its own display set', async function () {
    const { series, axial, sagittalRef16, sagittalRef4 } =
      await showSagittalAndAxial(renderingEngine, 'orientation-other-id');
    const axialOther = createNextViewport(renderingEngine, 'orientationOther');

    await showVolume(axialOther, series, 3, {
      orientation: OrientationAxis.AXIAL,
    });
    await moveTo(axialOther, worldOfVoxel(series, [16, 12, 3]));
    const axialRef5 = axial.getViewReference({ sliceIndex: 5 });

    expect(axialOther.getViewReference().dataId).not.toBe(sagittalRef16.dataId);
    expect(axialOther.getViewReference().volumeId).toBe(sagittalRef16.volumeId);
    expect(axialOther.getSliceIndex()).toBe(4);
    expect(answers(axialOther, sagittalRef16)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: true,
    });
    expect(answers(axialOther, sagittalRef4)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
    expect(answers(axialOther, axialRef5)).toEqual({
      plain: false,
      withNavigation: true,
      withOrientation: false,
      withOrientationAndNavigation: true,
    });
    expect(answers(axialOther, axial.getViewReference())).toEqual({
      plain: true,
      withNavigation: true,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
  });

  it('still checks the slice index of a reference of its own plane against its slices', async function () {
    const { axial } = await showSagittalAndAxial(
      renderingEngine,
      'orientation-same-plane'
    );
    const axialRef5 = axial.getViewReference({ sliceIndex: 5 });

    expect(axialRef5.sliceIndex).toBe(5);
    expect(answers(axial, axialRef5)).toEqual({
      plain: false,
      withNavigation: true,
      withOrientation: false,
      withOrientationAndNavigation: true,
    });
    expect(answers(axial, { ...axialRef5, sliceIndex: 16 })).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    });
  });
});

/**
 * The option `asVolume` asks whether a stack could show a reference if it
 * showed its images as a volume. The legacy stack viewport of commit
 * 58914567b, in the same scene, gave the answers that the tests state.
 */
describe('The option asVolume of a direct next planar viewport in stack mode -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('takes a reference of its frame of reference that names no image, in any plane, and shows it once it mounts the display set of the reference', async function () {
    const { series, sagittalRef16, sagittalRef4 } = await showSagittalAndAxial(
      renderingEngine,
      'as-volume-stack'
    );
    const stack = createNextViewport(renderingEngine, 'asVolumeStack');
    const all = {
      asVolume: true,
      withNavigation: true,
      withOrientation: true,
      withOrientationAndNavigation: true,
    };
    const none = {
      asVolume: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    };
    const otherFrame = { ...sagittalRef16, FrameOfReferenceUID: 'otherFrame' };

    delete otherFrame.planeRestriction;
    await showStack(stack, series, 3);

    expect(stack.getCurrentMode()).toBe('stack');
    expect(answers(stack, sagittalRef16)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    });
    expect(answersAsVolume(stack, sagittalRef16)).toEqual(all);
    expect(answersAsVolume(stack, sagittalRef4)).toEqual(all);
    expect(
      answersAsVolume(stack, {
        ...sagittalRef16,
        volumeId: 'asVolumeOtherVolume',
      })
    ).toEqual(all);
    expect(answersAsVolume(stack, otherFrame)).toEqual(none);

    await stack.setDisplaySets({ displaySetId: sagittalRef16.dataId });
    await renderAndWait(stack);
    stack.setViewReference(sagittalRef16);
    await renderAndWait(stack);

    expect(stack.getCurrentMode()).toBe('volume');
    expect(stack.isReferenceViewable(sagittalRef16)).toBe(true);
  });

  it('keeps the plane of its images without asVolume for a reference of another plane that names no data', async function () {
    const { series, sagittalRef16 } = await showSagittalAndAxial(
      renderingEngine,
      'as-volume-plane'
    );
    const stack = createNextViewport(renderingEngine, 'asVolumeStack');
    const frameOnly = { ...sagittalRef16 };

    delete frameOnly.dataId;
    delete frameOnly.volumeId;
    await showStack(stack, series, 3);

    expect(frameOnly.FrameOfReferenceUID).toBe(stack.getFrameOfReferenceUID());
    expect(frameOnly.sliceIndex).toBe(16);
    expect(stack.getCurrentImageIdIndex()).toBe(3);
    expect(answers(stack, frameOnly)).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    });
    expect(answers(stack, { ...frameOnly, sliceIndex: 3 })).toEqual({
      plain: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    });
    expect(answersAsVolume(stack, frameOnly)).toEqual({
      asVolume: true,
      withNavigation: true,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
  });

  it('takes a reference that names an image by its URI with asVolume only when the stack has that image', async function () {
    const series = await createSeries({ id: 'as-volume-uri' });
    const stack = createNextViewport(renderingEngine, 'asVolumeStack');

    await showStack(stack, series, 3);
    const FrameOfReferenceUID = stack.getFrameOfReferenceUID();

    expect(
      answersAsVolume(stack, {
        FrameOfReferenceUID,
        referencedImageURI: 'other-series/image',
      })
    ).toEqual({
      asVolume: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: false,
    });
    expect(
      answersAsVolume(stack, {
        FrameOfReferenceUID,
        referencedImageURI: utilities.imageIdToURI(series.imageIds[5]),
      })
    ).toEqual({
      asVolume: true,
      withNavigation: true,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
  });

  it('gives the answer without asVolume for a reference that names an image, and in volume mode', async function () {
    const { series, axial, sagittalRef16 } = await showSagittalAndAxial(
      renderingEngine,
      'as-volume-same'
    );
    const stack = createNextViewport(renderingEngine, 'asVolumeStack');

    await showStack(stack, series, 3);
    const axialRef = axial.getViewReference();

    expect(axialRef.referencedImageId).toBeDefined();
    expect(answersAsVolume(stack, axialRef)).toEqual({
      asVolume: true,
      withNavigation: true,
      withOrientation: true,
      withOrientationAndNavigation: true,
    });
    expect(answersAsVolume(axial, sagittalRef16)).toEqual({
      asVolume: false,
      withNavigation: false,
      withOrientation: false,
      withOrientationAndNavigation: true,
    });
  });
});
