import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { Events, CalibrationTypes } = Enums;
const { LengthTool, annotation, utilities: toolsUtilities } = csTools3d;
const { calibrateImageSpacing } = toolsUtilities;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'calibrationNext';

/** The two voxels of a measured line, as column and row of a slice. */
const LINE = [
  [4, 4],
  [16, 12],
];

/** The two voxels of a second line on the same slice. */
const SECOND_LINE = [
  [6, 16],
  [26, 16],
];

/** The length in millimetres of a line between two voxels of a series. */
function lengthInMillimetres({ size }, [start, end]) {
  return Math.hypot(
    (end[0] - start[0]) * size.columnSpacing,
    (end[1] - start[1]) * size.rowSpacing
  );
}

function getLengthAnnotations(element) {
  return annotation.state.getAnnotations(LengthTool.toolName, element) ?? [];
}

/** The length that the length tool worked out for an annotation. */
function lengthOf(lengthAnnotation) {
  const [stats] = Object.values(lengthAnnotation.data.cachedStats ?? {});

  return stats?.length;
}

/**
 * Whether a length is the expected one. A mouse point lies on a whole canvas
 * pixel, so a drawn line is a few hundredths of a millimetre off its voxels.
 */
function isClose(value, expected) {
  return typeof value === 'number' && Math.abs(value - expected) < 0.05;
}

/**
 * Draws a line with the length tool between two voxels of the slice on
 * display, and gives its annotation once the tool worked out its length.
 */
async function measure(viewport, [start, end], sliceIndex) {
  const { element } = viewport;
  const { imageData } = viewport.getImageData();
  const known = new Set(
    getLengthAnnotations(element).map(({ annotationUID }) => annotationUID)
  );
  const [down, move] = [start, end].map(([column, row]) =>
    testUtils.createNormalizedMouseEvent(
      imageData,
      [column, row, sliceIndex],
      element,
      viewport
    )
  );
  const findNew = () =>
    getLengthAnnotations(element).find(
      (candidate) =>
        !known.has(candidate.annotationUID) &&
        typeof lengthOf(candidate) === 'number'
    );

  element.dispatchEvent(
    new MouseEvent('mousedown', {
      target: element,
      buttons: 1,
      clientX: down.clientX,
      clientY: down.clientY,
      pageX: down.pageX,
      pageY: down.pageY,
    })
  );
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      target: element,
      buttons: 1,
      clientX: move.clientX,
      clientY: move.clientY,
      pageX: move.pageX,
      pageY: move.pageY,
    })
  );
  document.dispatchEvent(new MouseEvent('mouseup'));

  await waitFor(() => Boolean(findNew()));

  return findNew();
}

/** Goes to an image of a stack and waits until the viewport shows it. */
async function goToImage(viewport, series, imageIdIndex) {
  await viewport.setImageIdIndex(imageIdIndex);
  await waitFor(
    () => viewport.getCurrentImageId() === series.imageIds[imageIdIndex]
  );
  await renderAndWait(viewport);
}

describe('A calibration of an image on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let toolGroup;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [LengthTool],
      toolActivations: {
        [LengthTool.toolName]: {
          bindings: [{ mouseButton: 1 }],
        },
      },
    });

    renderingEngine = testEnv.renderingEngine;
    toolGroup = testEnv.toolGroups[toolGroupId];
  });

  afterEach(function () {
    annotation.state.removeAllAnnotations();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  /** Makes a direct next viewport with the length tool active on it. */
  function createMeasuredViewport() {
    const viewport = createNextViewport(renderingEngine, 'next');

    toolGroup.addViewport(viewport.id, renderingEngineId);

    return viewport;
  }

  it('keeps the lengths of an image calibrated in stack mode after a scroll away and back, and for a new measurement', async function () {
    const series = await createSeries({ id: 'calibrationStack' });
    const viewport = createMeasuredViewport();
    const scale = 2;

    await showStack(viewport, series, 2);

    const first = await measure(viewport, LINE, 2);

    expect(lengthOf(first)).toBeCloseTo(lengthInMillimetres(series, LINE), 1);

    calibrateImageSpacing(series.imageIds[2], renderingEngine, {
      type: CalibrationTypes.USER,
      scale,
    });
    await waitFor(() =>
      isClose(lengthOf(first), lengthInMillimetres(series, LINE) / scale)
    );
    await goToImage(viewport, series, 5);

    const onOtherImage = await measure(viewport, LINE, 5);

    await goToImage(viewport, series, 2);

    const second = await measure(viewport, SECOND_LINE, 2);

    expect(lengthOf(onOtherImage)).toBeCloseTo(
      lengthInMillimetres(series, LINE),
      1
    );
    expect(lengthOf(first)).toBeCloseTo(
      lengthInMillimetres(series, LINE) / scale,
      1
    );
    expect(lengthOf(second)).toBeCloseTo(
      lengthInMillimetres(series, SECOND_LINE) / scale,
      1
    );
  });

  it('follows in stack mode a calibration that is given while another image shows', async function () {
    const series = await createSeries({ id: 'calibrationAway' });
    const viewport = createMeasuredViewport();
    const scale = 2;

    await showStack(viewport, series, 2);

    const first = await measure(viewport, LINE, 2);

    await goToImage(viewport, series, 5);
    calibrateImageSpacing(series.imageIds[2], renderingEngine, {
      type: CalibrationTypes.USER,
      scale,
    });
    await goToImage(viewport, series, 2);
    await waitFor(() =>
      isClose(lengthOf(first), lengthInMillimetres(series, LINE) / scale)
    );

    const second = await measure(viewport, SECOND_LINE, 2);

    expect(lengthOf(second)).toBeCloseTo(
      lengthInMillimetres(series, SECOND_LINE) / scale,
      1
    );
  });

  it('fires IMAGE_SPACING_CALIBRATED in volume mode without a throw, and a volume slice keeps the spacing of the volume', async function () {
    const series = await createSeries({ id: 'calibrationVolume' });
    const viewport = createMeasuredViewport();
    const calibratedImageIds = [];

    await showVolume(viewport, series, 2);

    const first = await measure(viewport, LINE, 2);

    viewport.element.addEventListener(Events.IMAGE_SPACING_CALIBRATED, (evt) =>
      calibratedImageIds.push(evt.detail.imageId)
    );
    calibrateImageSpacing(series.imageIds[2], renderingEngine, {
      type: CalibrationTypes.USER,
      scale: 2,
    });
    await renderAndWait(viewport);

    const second = await measure(viewport, SECOND_LINE, 2);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(calibratedImageIds).toEqual([series.imageIds[2]]);
    expect(lengthOf(first)).toBeCloseTo(lengthInMillimetres(series, LINE), 1);
    expect(lengthOf(second)).toBeCloseTo(
      lengthInMillimetres(series, SECOND_LINE),
      1
    );
  });
});
