import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createLegacyViewport,
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis, ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;

/** The voxel of each slice whose grey on the canvas tells the slices apart. */
const PROBE_VOXEL = [20, 9];

/** The images of the series in an order that leaves no slice by one step. */
const JUMP_ORDER = [5, 0, 7, 2, 3, 1, 6, 4];

/**
 * The two views of a volume along its images. The slice index of a view
 * counts along its view plane normal. The acquisition orientation looks
 * against the direction of the slices, so its slice index runs against the
 * order of the image ids. A view by vectors along the direction of the
 * slices counts in the order of the image ids.
 */
const VOLUMES = [
  [
    'with the order of its images',
    { viewPlaneNormal: [0, 0, 1], viewUp: [0, -1, 0] },
    (index) => index,
  ],
  [
    'against the order of its images',
    OrientationAxis.ACQUISITION,
    (index, count) => count - 1 - index,
  ],
];

/** The draw paths of a volume on a direct next planar viewport. */
const VOLUME_PATHS = [
  ['on the sampled slice path', {}, 'vtkSampledSlice'],
  ['on the volume slice path', { sliceFirst: false }, 'vtkVolumeSlice'],
  ['on the CPU', { renderBackend: 'cpu' }, 'cpuVolume'],
];

/** The draw paths of a stack on a direct next planar viewport. */
const STACK_PATHS = [
  ['on the GPU', {}, 'vtkImage'],
  ['on the CPU', { renderBackend: 'cpu' }, 'cpuImage'],
];

/** Resolves after a few animation frames. */
async function frames(count = 3) {
  for (let index = 0; index < count; index++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Waits until what the viewport was asked for is drawn. */
async function settle(viewport) {
  await frames();
  await renderAndWait(viewport);
}

/** One canvas for every read of a pixel: a read makes no canvas of its own. */
const pixelReader = document.createElement('canvas');

/** The red value that the canvas of the viewport shows at a canvas point. */
function redAt(viewport, canvasPoint) {
  const source = viewport.getCanvas();
  const ratio = source.width / WIDTH;
  const context = pixelReader.getContext('2d', { willReadFrequently: true });

  if (
    pixelReader.width !== source.width ||
    pixelReader.height !== source.height
  ) {
    pixelReader.width = source.width;
    pixelReader.height = source.height;
  }

  context.clearRect(0, 0, pixelReader.width, pixelReader.height);
  context.drawImage(source, 0, 0);

  return context.getImageData(
    Math.floor(canvasPoint[0] * ratio),
    Math.floor(canvasPoint[1] * ratio),
    1,
    1
  ).data[0];
}

/**
 * The grey that the canvas shows at the probe voxel of the image `k` of the
 * series. It differs from image to image, so it tells which image is drawn.
 */
function greyOfImage(viewport, series, k) {
  return redAt(
    viewport,
    viewport.worldToCanvas(worldOfVoxel(series, [...PROBE_VOXEL, k]))
  );
}

/**
 * Shows each image of the series by a way that names no image id, a world
 * point for a volume and an index for a stack, and gives the grey of each.
 */
async function greysByPlace(viewport, series) {
  const greys = [];

  for (let k = 0; k < series.imageIds.length; k++) {
    viewport.setViewState({
      slice:
        viewport.getCurrentMode() === 'volume'
          ? {
              kind: 'volumePoint',
              sliceWorldPoint: worldOfVoxel(series, [...PROBE_VOXEL, k]),
            }
          : { kind: 'stackIndex', imageIdIndex: k },
    });
    await settle(viewport);
    greys.push(greyOfImage(viewport, series, k));
  }

  return greys;
}

/**
 * Jumps to each image of the series by a view reference made by
 * `referenceOf(imageId)` and gives, for each, what the viewport then says
 * and draws.
 */
async function jumpToEachImage(viewport, series, referenceOf) {
  const landed = [];

  for (const k of JUMP_ORDER) {
    viewport.setViewReference(referenceOf(series.imageIds[k]));
    await settle(viewport);
    landed.push({
      asked: k,
      currentImage: series.imageIds.indexOf(viewport.getCurrentImageId()),
      referencedImage: series.imageIds.indexOf(
        viewport.getViewReference().referencedImageId
      ),
      referencedImageURI: viewport.getViewReference().referencedImageURI,
      grey: greyOfImage(viewport, series, k),
    });
  }

  return landed;
}

/** What `jumpToEachImage` gives when every jump lands on its image. */
function landedOnEachImage(series, greys) {
  return JUMP_ORDER.map((k) => ({
    asked: k,
    currentImage: k,
    referencedImage: k,
    referencedImageURI: utilities.imageIdToURI(series.imageIds[k]),
    grey: greys[k],
  }));
}

describe('A jump to an image by a view reference on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [order, orientation, imageOfSlice] of VOLUMES) {
    for (const [path, pathOptions, renderMode] of VOLUME_PATHS) {
      it(`lands on the image of a referencedImageId and of a referencedImageURI in volume mode ${path}, for a volume whose slices run ${order}`, async function () {
        const series = await createSeries({ id: `jump-${renderMode}` });
        const viewport = createNextViewport(renderingEngine, 'nextJump');
        const count = series.imageIds.length;

        await showVolume(viewport, series, 2, { orientation, ...pathOptions });

        expect(viewport.getCurrentMode()).toBe('volume');
        expect(viewport.getRenderPlan()[0].renderMode).toBe(renderMode);

        await viewport.setImageIdIndex(1);
        await settle(viewport);

        expect(viewport.getCurrentImageIdIndex()).toBe(1);
        expect(series.imageIds.indexOf(viewport.getCurrentImageId())).toBe(
          imageOfSlice(1, count)
        );

        for (let sliceIndex = 0; sliceIndex < count; sliceIndex++) {
          const imageOfTheSlice =
            series.imageIds[imageOfSlice(sliceIndex, count)];

          expect(viewport.getCurrentImageId({ sliceIndex })).toBe(
            imageOfTheSlice
          );
          expect(
            viewport.getViewReference({ sliceIndex }).referencedImageId
          ).toBe(imageOfTheSlice);
        }

        const greys = await greysByPlace(viewport, series);

        expect(new Set(greys).size).toBe(count);
        expect(
          await jumpToEachImage(viewport, series, (imageId) => ({
            referencedImageId: imageId,
          }))
        ).toEqual(landedOnEachImage(series, greys));
        expect(
          await jumpToEachImage(viewport, series, (imageId) => ({
            referencedImageURI: utilities.imageIdToURI(imageId),
          }))
        ).toEqual(landedOnEachImage(series, greys));
      });
    }
  }

  for (const [path, pathOptions, renderMode] of STACK_PATHS) {
    it(`lands on the image of a referencedImageId and of a referencedImageURI in stack mode ${path}`, async function () {
      const series = await createSeries({ id: `jump-${renderMode}` });
      const viewport = createNextViewport(renderingEngine, 'nextJump');

      await showStack(viewport, series, 2, pathOptions);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getRenderPlan()[0].renderMode).toBe(renderMode);

      const greys = await greysByPlace(viewport, series);

      expect(new Set(greys).size).toBe(series.imageIds.length);
      expect(
        await jumpToEachImage(viewport, series, (imageId) => ({
          referencedImageId: imageId,
        }))
      ).toEqual(landedOnEachImage(series, greys));
      expect(
        await jumpToEachImage(viewport, series, (imageId) => ({
          referencedImageURI: utilities.imageIdToURI(imageId),
        }))
      ).toEqual(landedOnEachImage(series, greys));
    });
  }

  for (const [order, orientation] of VOLUMES) {
    it(`lands on the same image with the view reference of the other mode, for a stack and a volume whose slices run ${order}`, async function () {
      const series = await createSeries({ id: 'jump-modes' });
      const stack = createNextViewport(renderingEngine, 'nextStack');
      const volume = createNextViewport(renderingEngine, 'nextVolume');

      await showStack(stack, series, 2);
      await showVolume(volume, series, 2, { orientation });

      expect(stack.getCurrentMode()).toBe('stack');
      expect(volume.getCurrentMode()).toBe('volume');

      const landedOn = { volume: [], stack: [] };

      for (const k of JUMP_ORDER) {
        await stack.setImageIdIndex(k);
        await settle(stack);
        volume.setViewReference(stack.getViewReference());
        await settle(volume);
        landedOn.volume.push(
          series.imageIds.indexOf(volume.getCurrentImageId())
        );
      }

      for (const k of [...JUMP_ORDER].reverse()) {
        volume.setViewState({
          slice: {
            kind: 'volumePoint',
            sliceWorldPoint: worldOfVoxel(series, [...PROBE_VOXEL, k]),
          },
        });
        await settle(volume);
        stack.setViewReference(volume.getViewReference());
        await settle(stack);
        landedOn.stack.push(series.imageIds.indexOf(stack.getCurrentImageId()));
      }

      expect(landedOn.volume).toEqual(JUMP_ORDER);
      expect(landedOn.stack).toEqual([...JUMP_ORDER].reverse());
    });
  }

  for (const [order, orientation] of VOLUMES) {
    it(`lands on the image as a legacy volume viewport and its adapter do, for a volume whose slices run ${order}`, async function () {
      const series = await createSeries({ id: 'jump-legacy' });
      const legacy = createLegacyViewport(
        renderingEngine,
        'legacyJump',
        ViewportType.ORTHOGRAPHIC,
        { orientation }
      );
      const adapter = createLegacyViewport(
        renderingEngine,
        'adapterJump',
        ViewportType.ORTHOGRAPHIC,
        { adapter: true, orientation }
      );
      const next = createNextViewport(renderingEngine, 'nextJump');

      await legacy.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(legacy);
      await adapter.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(adapter);
      await showVolume(next, series, 2, { orientation });

      const landedOn = {};

      for (const viewport of [legacy, adapter, next]) {
        const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

        landedOn[viewport.id] = [];

        for (const k of JUMP_ORDER) {
          viewport.setViewReference({
            FrameOfReferenceUID,
            referencedImageId: series.imageIds[k],
          });
          await settle(viewport);
          landedOn[viewport.id].push(
            series.imageIds.indexOf(viewport.getCurrentImageId())
          );
        }
      }

      expect(landedOn.nextJump).toEqual(JUMP_ORDER);
      expect(landedOn.legacyJump).toEqual(JUMP_ORDER);
      expect(landedOn.adapterJump).toEqual(JUMP_ORDER);
    });
  }
});
