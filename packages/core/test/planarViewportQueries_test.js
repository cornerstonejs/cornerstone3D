import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  drawPathOf,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache, geometryLoader, displaySetRegistry } =
  cornerstone3D;
const { OrientationAxis, ViewportType, GeometryType } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The slice that the tests show. */
const SLICE = 3;

/** The draw paths of a stack, with the options of the display set. */
const STACK_PATHS = [
  ['frame-gpu', {}],
  ['frame-cpu', { renderBackend: 'cpu' }],
];

/** The draw paths of a volume, with the options of the display set. */
const VOLUME_PATHS = [
  ['cpu-gpu', {}],
  ['gpuVolume-gpu', { sliceFirst: false }],
  ['cpu-cpu', { renderBackend: 'cpu' }],
];

/**
 * Gives each image of a series the pixel values that its loader states:
 * from `low - 10 k` to `high + 10 k` on image `k`. The range of image `k` is
 * then that pair, and the range of the volume runs from the first value of
 * the last image to the second of the last image.
 */
function stateImageRanges(series, low, high) {
  series.imageIds.forEach((imageId, k) => {
    const image = cache.getImage(imageId);

    image.minPixelValue = low - 10 * k;
    image.maxPixelValue = high + 10 * k;
  });

  const last = series.imageIds.length - 1;

  return {
    imageRange: (k) => [low - 10 * k, high + 10 * k],
    volumeRange: [low - 10 * last, high + 10 * last],
  };
}

/** Makes a direct next 3D viewport of 400 by 300 pixels. */
function create3DViewport(renderingEngine, viewportId) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: { orientation: OrientationAxis.CORONAL },
  });

  return renderingEngine.getViewport(viewportId);
}

/** Registers the volume of a series under a display set id of its own. */
function registerVolume(displaySetId, series, extra = {}) {
  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
    ...extra,
  });
}

/** Registers the images of a series as a stack under a display set id. */
function registerStack(displaySetId, series) {
  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    initialImageIdIndex: SLICE,
  });
}

/**
 * Shows a fusion on a planar viewport: `source` as the source and `overlay`
 * as an overlay. With `overlayFirst` the overlay is mounted first and the
 * source is named by its role, so the mount order is not the order of the
 * roles.
 */
async function showFusion(
  viewport,
  sourceId,
  overlayId,
  options = {},
  overlayFirst = false
) {
  const entryOf = (displaySetId, role) => ({
    displaySetId,
    options: { orientation: OrientationAxis.ACQUISITION, ...options, role },
  });
  const source = entryOf(sourceId, 'source');
  const overlay = entryOf(overlayId, 'overlay');

  await viewport.setDisplaySets(
    ...(overlayFirst ? [overlay, source] : [source, overlay])
  );
  await renderAndWait(viewport);
}

/** A cached surface geometry of a box, as the 3D geometry tests make it. */
async function createSurface(geometryId) {
  const points = [];

  for (const x of [0, 30]) {
    points.push(x, 0, 0, x, 20, 0, x, 20, 10, x, 0, 10);
  }

  await geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'viewportQueriesFrame',
      segmentIndex: 1,
      points,
      polys: [4, 0, 1, 2, 3, 4, 4, 5, 6, 7],
    },
  });
}

describe('The queries of a direct planar and 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    displaySetRegistry.clear();

    if (cache.getGeometry('viewportQueriesSurface')) {
      cache.removeGeometryLoadObject('viewportQueriesSurface');
    }

    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  describe('getScalarRange', () => {
    it('gives the range of the image on display of a stack, the same on the GPU and the CPU, and follows a scroll', async function () {
      const series = await createSeries({ id: 'rangeStack' });
      const { imageRange } = stateImageRanges(series, -100, 200);

      for (const [drawPath, options] of STACK_PATHS) {
        const viewport = createNextViewport(
          renderingEngine,
          `rangeStack-${drawPath}`
        );

        await showStack(viewport, series, SLICE, options);

        expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
        expect(viewport.getScalarRange()).toEqual(imageRange(SLICE));
        expect(
          viewport.getScalarRange(viewport.getSourceDisplaySetId())
        ).toEqual(imageRange(SLICE));

        viewport.setViewState({
          slice: { kind: 'stackIndex', imageIdIndex: 5 },
        });
        await waitFor(
          () => viewport.getCurrentImageId() === series.imageIds[5]
        );

        expect(viewport.getScalarRange()).toEqual(imageRange(5));
      }
    });

    it('gives the range of the whole volume on the CPU slice on the GPU, the GPU volume slice, the CPU slice on the CPU and on a 3D viewport', async function () {
      const series = await createSeries({ id: 'rangeVolume' });
      const { volumeRange } = stateImageRanges(series, -100, 200);

      for (const [drawPath, options] of VOLUME_PATHS) {
        const viewport = createNextViewport(
          renderingEngine,
          `rangeVolume-${drawPath}`
        );

        await showVolume(viewport, series, SLICE, options);

        expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
        expect(viewport.getScalarRange()).toEqual(volumeRange);
      }

      const viewport3D = create3DViewport(renderingEngine, 'rangeVolume-3d');

      registerVolume('rangeVolume:3d', series);
      await viewport3D.setDisplaySets({ displaySetId: 'rangeVolume:3d' });

      expect(viewport3D.getCurrentMode()).toBe('volume3d');
      expect(viewport3D.getScalarRange()).toEqual(volumeRange);
      expect(viewport3D.getScalarRange('rangeVolume:3d')).toEqual(volumeRange);
      expect(viewport3D.getScalarRange('notMounted')).toBeUndefined();
    });

    it('gives the range of the source and of an overlay of a fusion on each draw path', async function () {
      const ct = await createSeries({ id: 'rangeFusionCT' });
      const pt = await createSeries({ id: 'rangeFusionPT' });
      const ctRanges = stateImageRanges(ct, -1000, 1000);
      const ptRanges = stateImageRanges(pt, 0, 50);

      for (const [mode, paths, register, rangeOf] of [
        [
          'stack',
          STACK_PATHS,
          registerStack,
          (ranges) => ranges.imageRange(SLICE),
        ],
        [
          'volume',
          VOLUME_PATHS,
          registerVolume,
          (ranges) => ranges.volumeRange,
        ],
      ]) {
        for (const [drawPath, options] of paths) {
          const viewport = createNextViewport(
            renderingEngine,
            `rangeFusion-${mode}-${drawPath}`
          );
          const ctId = `rangeFusion:${mode}:${drawPath}:ct`;
          const ptId = `rangeFusion:${mode}:${drawPath}:pt`;

          register(ctId, ct);
          register(ptId, pt);
          await showFusion(viewport, ctId, ptId, options);

          if (mode === 'stack') {
            await waitFor(
              () => viewport.getCurrentImageId() === ct.imageIds[SLICE]
            );
          }

          expect(viewport.getCurrentMode()).toBe(mode);
          expect(drawPathOf(viewport.getRenderPlan()[0])).toBe(drawPath);
          expect(viewport.getScalarRange()).toEqual(rangeOf(ctRanges));
          expect(viewport.getScalarRange(ctId)).toEqual(rangeOf(ctRanges));
          expect(viewport.getScalarRange(ptId)).toEqual(rangeOf(ptRanges));
          expect(viewport.getScalarRange('notMounted')).toBeUndefined();
        }
      }
    });
  });

  describe('getVolumeIds and getDisplaySetIdForVolumeId', () => {
    it('give the volumes of a fusion, the source first, and the display set of each volume, on the GPU and the CPU', async function () {
      const ct = await createSeries({ id: 'idsFusionCT' });
      const pt = await createSeries({ id: 'idsFusionPT' });

      for (const [backend, options] of [
        ['gpu', {}],
        ['cpu', { renderBackend: 'cpu' }],
      ]) {
        const viewport = createNextViewport(
          renderingEngine,
          `idsFusion-${backend}`
        );
        const ctId = `idsFusion:${backend}:ct`;
        const ptId = `idsFusion:${backend}:pt`;

        registerVolume(ctId, ct);
        registerVolume(ptId, pt);
        await showFusion(viewport, ctId, ptId, options, true);

        expect(viewport.getDisplaySets().map((entry) => entry.displaySetId))
          .withContext('the mount order')
          .toEqual([ptId, ctId]);
        expect(viewport.getVolumeIds()).toEqual([ct.volumeId, pt.volumeId]);
        expect(viewport.getDisplaySetIdForVolumeId(ct.volumeId)).toBe(ctId);
        expect(viewport.getDisplaySetIdForVolumeId(pt.volumeId)).toBe(ptId);
        expect(
          viewport.getDisplaySetIdForVolumeId('volume:unknown')
        ).toBeUndefined();
      }
    });

    it('leave out a labelmap overlay of a segmentation, which the option adds', async function () {
      const ct = await createSeries({ id: 'idsLabelmapCT' });
      const labelmap = await createSeries({ id: 'idsLabelmapSeg' });
      const viewport = createNextViewport(renderingEngine, 'idsLabelmap');
      const representationUID = 'idsLabelmap-Labelmap-1';

      registerVolume('idsLabelmap:ct', ct);
      registerVolume(representationUID, labelmap, {
        reference: {
          kind: 'segmentation',
          segmentationId: 'idsLabelmap',
          representationUID,
          labelmapId: 'idsLabelmapSeg',
        },
      });
      await viewport.setDisplaySets(
        {
          displaySetId: 'idsLabelmap:ct',
          options: { orientation: OrientationAxis.ACQUISITION },
        },
        {
          displaySetId: representationUID,
          options: {
            orientation: OrientationAxis.ACQUISITION,
            role: 'overlay',
          },
        }
      );
      await renderAndWait(viewport);

      expect(viewport.getDisplaySets().length).toBe(2);
      expect(viewport.getVolumeIds()).toEqual([ct.volumeId]);
      expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([
        ct.volumeId,
        labelmap.volumeId,
      ]);
      expect(viewport.getDisplaySetIdForVolumeId(labelmap.volumeId)).toBe(
        representationUID
      );
    });

    it('give no volume in stack mode, also for a fusion of two stacks', async function () {
      const ct = await createSeries({ id: 'idsStackCT' });
      const pt = await createSeries({ id: 'idsStackPT' });
      const viewport = createNextViewport(renderingEngine, 'idsStack');

      registerStack('idsStack:ct', ct);
      registerStack('idsStack:pt', pt);
      await showFusion(viewport, 'idsStack:ct', 'idsStack:pt', {}, true);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getDisplaySets().length).toBe(2);
      expect(viewport.getVolumeIds()).toEqual([]);
      expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([]);
    });

    it('give the volume of a 3D viewport, without a labelmap overlay or a surface, and nothing for a surface alone', async function () {
      const ct = await createSeries({ id: 'ids3DCT' });
      const labelmap = await createSeries({ id: 'ids3DSeg' });
      const viewport = create3DViewport(renderingEngine, 'ids3D');
      const representationUID = 'ids3D-Labelmap-1';

      registerVolume('ids3D:ct', ct);
      registerVolume(representationUID, labelmap, {
        reference: {
          kind: 'segmentation',
          segmentationId: 'ids3D',
          representationUID,
          labelmapId: 'ids3DSeg',
        },
      });
      await createSurface('viewportQueriesSurface');
      await viewport.setDisplaySets(
        { displaySetId: 'ids3D:ct' },
        { displaySetId: representationUID, options: { role: 'overlay' } },
        {
          displaySetId: 'viewportQueriesSurface',
          options: { role: 'overlay' },
        }
      );

      expect(viewport.getVolumeIds()).toEqual([ct.volumeId]);
      expect(viewport.getVolumeIds({ includeSegmentations: true })).toEqual([
        ct.volumeId,
        labelmap.volumeId,
      ]);
      expect(viewport.getDisplaySetIdForVolumeId(ct.volumeId)).toBe('ids3D:ct');
      expect(viewport.getDisplaySetIdForVolumeId(labelmap.volumeId)).toBe(
        representationUID
      );
      expect(
        viewport.getDisplaySetIdForVolumeId('volume:unknown')
      ).toBeUndefined();
      expect(
        viewport.getDisplaySetIdForVolumeId('viewportQueriesSurface')
      ).toBeUndefined();

      await viewport.setDisplaySets({ displaySetId: 'viewportQueriesSurface' });

      expect(viewport.getVolumeIds()).toEqual([]);
    });
  });

  describe('isInAcquisitionPlane', () => {
    it('is true for a stack and for an axial view of an axial series, false for a sagittal reformat and an oblique plane, and the utility gives the same', async function () {
      const series = await createSeries({ id: 'acquisitionAxial' });
      const cases = [
        ['a stack', showStack, {}, true],
        ['a stack on the CPU', showStack, { renderBackend: 'cpu' }, true],
        [
          'an axial view',
          showVolume,
          { orientation: OrientationAxis.AXIAL },
          true,
        ],
        [
          'an axial view on the CPU',
          showVolume,
          { orientation: OrientationAxis.AXIAL, renderBackend: 'cpu' },
          true,
        ],
        [
          'a sagittal reformat',
          showVolume,
          { orientation: OrientationAxis.SAGITTAL },
          false,
        ],
        [
          'an oblique plane',
          showVolume,
          {
            orientation: {
              viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
              viewUp: [0, -1, 0],
            },
          },
          false,
        ],
      ];

      for (const [index, [name, show, options, expected]] of cases.entries()) {
        const viewport = createNextViewport(
          renderingEngine,
          `acquisition-${index}`
        );

        await show(viewport, series, SLICE, options);

        expect(viewport.isInAcquisitionPlane())
          .withContext(name)
          .toBe(expected);
        expect(utilities.isInAcquisitionPlane(viewport))
          .withContext(name)
          .toBe(expected);
      }

      const empty = createNextViewport(renderingEngine, 'acquisition-empty');

      expect(empty.isInAcquisitionPlane()).toBe(false);
    });

    it('is not a member of a 3D viewport, and the utility gives false for it', async function () {
      const series = await createSeries({ id: 'acquisition3D' });
      const viewport = create3DViewport(renderingEngine, 'acquisition3D');

      registerVolume('acquisition3D', series);
      await viewport.setDisplaySets({ displaySetId: 'acquisition3D' });

      expect(viewport.isInAcquisitionPlane).toBeUndefined();
      expect(utilities.isInAcquisitionPlane(viewport)).toBe(false);
    });
  });

  describe('getCurrentMode of a 3D viewport', () => {
    it('is geometry3d with only a surface, volume3d with a volume', async function () {
      const series = await createSeries({ id: 'mode3D' });
      const viewport = create3DViewport(renderingEngine, 'mode3D');

      expect(viewport.getCurrentMode()).toBe('empty');

      await createSurface('viewportQueriesSurface');
      await viewport.setDisplaySets({ displaySetId: 'viewportQueriesSurface' });

      expect(viewport.getCurrentMode()).toBe('geometry3d');
      expect(utilities.getViewportContentMode(viewport)).toBe('geometry3d');
      expect(utilities.viewportIsInVolumeMode(viewport)).toBe(false);
      expect(viewport.getScalarRange()).toBeUndefined();

      registerVolume('mode3D', series);
      await viewport.setDisplaySets({ displaySetId: 'mode3D' });

      expect(viewport.getCurrentMode()).toBe('volume3d');
    });
  });
});
