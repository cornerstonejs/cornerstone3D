import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, displaySetRegistry } = cornerstone3D;
const { OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Records what the viewport reports while it mounts: each NEW_IMAGE with its
 * image and slice, and the focal point of each draw.
 */
/** The camera of the view on display. */
function cameraOf(viewport) {
  return viewport.getResolvedView().toICamera();
}

function recordMount(viewport) {
  const newImages = [];
  const drawnFocalPoints = [];
  const onNewImage = (evt) =>
    newImages.push({
      imageId: evt.detail.imageId,
      sliceIndex: evt.detail.sliceIndex,
      focalPoint: viewport.getResolvedView()?.toICamera()?.focalPoint,
    });
  const onRendered = () =>
    drawnFocalPoints.push([...cameraOf(viewport).focalPoint]);

  viewport.element.addEventListener(Events.NEW_IMAGE, onNewImage);
  viewport.element.addEventListener(Events.IMAGE_RENDERED, onRendered);

  return { newImages, drawnFocalPoints };
}

describe('A planar mount that starts at a view reference -- ', () => {
  let renderingEngine;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries({ id: 'initialViewReference' });
    displaySetRegistry.add('initialViewReference', {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
  });

  afterEach(function () {
    displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('draws and reports the sagittal slice of the reference first, and no other slice', async function () {
    const viewport = createNextViewport(renderingEngine, 'startSagittal');
    const target = worldOfVoxel(series, [24, 12, 4]);
    const record = recordMount(viewport);

    await viewport.setDisplaySets({
      displaySetId: 'initialViewReference',
      options: {
        mode: 'volume',
        orientation: OrientationAxis.SAGITTAL,
        initialViewReference: {
          FrameOfReferenceUID: 'bothModesFrame',
          cameraFocalPoint: target,
          viewPlaneNormal: [1, 0, 0],
        },
      },
    });
    await renderAndWait(viewport);

    expect(record.newImages.length).toBe(1);
    expect(record.newImages[0].focalPoint[0]).toBeCloseTo(target[0], 3);
    expect(record.drawnFocalPoints.length).toBeGreaterThan(0);
    record.drawnFocalPoints.forEach((focalPoint) =>
      expect(focalPoint[0]).toBeCloseTo(target[0], 3)
    );
  });

  it('starts an acquisition plane volume at the image that the reference names', async function () {
    const viewport = createNextViewport(renderingEngine, 'startImage');
    const record = recordMount(viewport);
    const referencedImageId = series.imageIds[2];

    await viewport.setDisplaySets({
      displaySetId: 'initialViewReference',
      options: {
        mode: 'volume',
        initialViewReference: {
          FrameOfReferenceUID: 'bothModesFrame',
          referencedImageId,
        },
      },
    });
    await renderAndWait(viewport);

    expect(record.newImages.map(({ imageId }) => imageId)).toEqual([
      referencedImageId,
    ]);
    expect(viewport.getCurrentImageId()).toBe(referencedImageId);
  });

  it('starts a stack at the image that the reference names', async function () {
    const viewport = createNextViewport(renderingEngine, 'startStack');
    const record = recordMount(viewport);
    const referencedImageId = series.imageIds[5];

    await viewport.setDisplaySets({
      displaySetId: 'initialViewReference',
      options: {
        mode: 'stack',
        initialViewReference: { referencedImageId },
      },
    });
    await renderAndWait(viewport);

    expect(record.newImages.map(({ imageId }) => imageId)).toEqual([
      referencedImageId,
    ]);
    expect(viewport.getCurrentImageId()).toBe(referencedImageId);
  });

  it('shows the default slice for a reference that the mount cannot show, and mounts as without it', async function () {
    const viewport = createNextViewport(renderingEngine, 'startNotViewable');
    const reference = createNextViewport(renderingEngine, 'startDefault');
    const record = recordMount(viewport);

    await viewport.setDisplaySets({
      displaySetId: 'initialViewReference',
      options: {
        mode: 'volume',
        orientation: OrientationAxis.SAGITTAL,
        initialViewReference: {
          FrameOfReferenceUID: 'bothModesFrame',
          cameraFocalPoint: worldOfVoxel(series, [3, 3, 3]),
          viewPlaneNormal: [0, 0, 1],
        },
      },
    });
    await reference.setDisplaySets({
      displaySetId: 'initialViewReference',
      options: { mode: 'volume', orientation: OrientationAxis.SAGITTAL },
    });
    await renderAndWait(viewport);

    expect(record.newImages.length).toBe(1);
    expect(cameraOf(viewport).viewPlaneNormal).toEqual(
      cameraOf(reference).viewPlaneNormal
    );
    cameraOf(viewport).focalPoint.forEach((value, axis) =>
      expect(value).toBeCloseTo(cameraOf(reference).focalPoint[axis], 3)
    );
  });
});
