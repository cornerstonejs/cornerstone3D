import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';
import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  STRAIGHT_PLANE,
  TILTED_PLANE,
  createLegacyViewport,
  createNextViewport,
  createSeries,
  dot,
  expectPointsClose,
  renderAndWait,
  showStack,
  showVolume,
  sliceNormal,
  storedValue,
  waitFor,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities } = cornerstone3D;
const { OrientationAxis, ViewportType } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The value of the image data of a viewport at a world point. */
function valueAtWorld(viewport, point, volumeId) {
  const { imageData, voxelManager } = viewport.getImageData(volumeId);

  return voxelManager.getAtIJKPoint(
    utilities.transformWorldToIndex(imageData, point)
  );
}

/** The index in the image data of a pixel of the slice on display. */
function indexOfSlicePixel(slice, [x, y]) {
  return Array.from(
    vec3.transformMat4(vec3.create(), [x, y, 0], slice.sliceToIndexMatrix),
    Math.round
  );
}

/** The pixels that a test series stores in its slice `k`, row by row. */
function storedSlicePixels({ size }, k) {
  const pixels = [];

  for (let j = 0; j < size.rows; j++) {
    for (let i = 0; i < size.columns; i++) {
      pixels.push(storedValue([i, j, k]));
    }
  }

  return pixels;
}

/** Half the distance between the two clipping planes of a slice, in mm. */
const CLIPPING_OFFSET = 0.05;

/**
 * Checks that the pair of planes of an entry lies around slice `k` of a
 * series, within 1e-3 mm: the first plane behind the slice with the view
 * normal, the second in front of it with the opposite normal. The view looks
 * against the slice axis of the series.
 */
function expectPlanesAroundSlice(entry, series, k) {
  const viewPlaneNormal = sliceNormal(series).map((value) => -value);
  const slicePoint = worldOfVoxel(series, [0, 0, k]);
  const [behind, front] = entry.planes;

  expect(entry.planes.length).toBe(2);
  expectPointsClose(behind.normal, viewPlaneNormal);
  expectPointsClose(
    front.normal,
    viewPlaneNormal.map((value) => -value)
  );
  expect(
    dot(behind.origin, viewPlaneNormal) - dot(slicePoint, viewPlaneNormal)
  ).toBeCloseTo(-CLIPPING_OFFSET, 3);
  expect(
    dot(front.origin, viewPlaneNormal) - dot(slicePoint, viewPlaneNormal)
  ).toBeCloseTo(CLIPPING_OFFSET, 3);
}

/**
 * Checks that two entries hold the same planes, within 1e-3 mm: the same
 * normals and the same distance of each plane from the world origin.
 */
function expectSamePlanes(actual, expected) {
  expect(actual.planes.length).toBe(expected.planes.length);
  actual.planes.forEach((plane, index) => {
    const expectedPlane = expected.planes[index];

    expectPointsClose(plane.normal, expectedPlane.normal);
    expect(dot(plane.origin, plane.normal)).toBeCloseTo(
      dot(expectedPlane.origin, expectedPlane.normal),
      3
    );
  });
}

/** Shows slice `k` of a series on a stack viewport and on a volume viewport. */
async function showSliceOnBoth(stack, volume, series, k) {
  stack.setViewState({ slice: { kind: 'stackIndex', imageIdIndex: k } });
  await waitFor(() => stack.getCurrentImageId() === series.imageIds[k]);
  await renderAndWait(stack);
  volume.setViewState({
    slice: {
      kind: 'volumePoint',
      sliceWorldPoint: worldOfVoxel(series, [16, 12, k]),
    },
  });
  await renderAndWait(volume);
}

const SLICE_PIXELS = [
  [0, 0],
  [5, 7],
  [31, 0],
  [0, 23],
  [31, 23],
];

describe('A direct next planar viewport in stack mode and in volume mode -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  describe('the image data of the viewport', () => {
    it('gives the stored value at a world point of the slice on display, for a stack on the GPU, a stack on the CPU and a volume', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const stackCpu = createNextViewport(renderingEngine, 'stackCpu');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 3);
      await showStack(stackCpu, series, 3, { renderBackend: 'cpu' });
      await showVolume(volume, series, 3);

      expect(stack.getCurrentMode()).toBe('stack');
      expect(stack.getRenderPlan()[0].renderMode).toBe('vtkImage');
      expect(stackCpu.getCurrentMode()).toBe('stack');
      expect(stackCpu.getRenderPlan()[0].renderMode).toBe('cpuImage');
      expect(volume.getCurrentMode()).toBe('volume');
      expect(volume.getCurrentImageId()).toBe(stack.getCurrentImageId());

      [
        [5, 7, 3],
        [0, 0, 3],
        [31, 23, 3],
        [20, 2, 3],
      ].forEach((voxel) => {
        const point = worldOfVoxel(series, voxel);

        expect(valueAtWorld(stack, point)).toBe(storedValue(voxel));
        expect(valueAtWorld(stackCpu, point)).toBe(storedValue(voxel));
        expect(valueAtWorld(volume, point)).toBe(storedValue(voxel));
      });
    });

    it('gives the bounds of a stack image inside the bounds of the volume, with the same extent in the plane, on the GPU and on the CPU', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const stackCpu = createNextViewport(renderingEngine, 'stackCpu');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 3);
      await showStack(stackCpu, series, 3, { renderBackend: 'cpu' });
      await showVolume(volume, series, 3);

      const volumeBounds = volume.getImageData().imageData.getBounds();
      const sliceZ = worldOfVoxel(series, [0, 0, 3])[2];

      expectPointsClose(volumeBounds, [-10.5, 21.5, 4.25, 40.25, 19, 35]);

      [stack, stackCpu].forEach((viewport) => {
        const bounds = viewport.getImageData().imageData.getBounds();

        expectPointsClose(bounds.slice(0, 4), volumeBounds.slice(0, 4));
        expect(bounds[4]).toBeCloseTo(sliceZ, 2);
        expect(bounds[5]).toBeCloseTo(sliceZ, 2);
        expect(bounds[4]).not.toBeLessThan(volumeBounds[4]);
        expect(bounds[5]).not.toBeGreaterThan(volumeBounds[5]);
      });
    });

    it('gives the bounds of a tilted stack image as vtkImageData does for the same image, within 1e-4 mm', async function () {
      const series = await createSeries({ plane: TILTED_PLANE });
      const stack = createNextViewport(renderingEngine, 'stack');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 3);
      await showVolume(volume, series, 3);

      const { imageData, dimensions, direction, origin, spacing } =
        stack.getImageData();
      const bounds = imageData.getBounds();
      const volumeBounds = volume.getImageData().imageData.getBounds();
      const vtkImage = vtkImageData.newInstance();

      vtkImage.setDimensions(dimensions);
      vtkImage.setSpacing(spacing);
      vtkImage.setDirection(direction);
      vtkImage.setOrigin(origin);
      expectPointsClose(bounds, vtkImage.getBounds(), 4);

      const corners = [
        [-0.5, -0.5, 3],
        [dimensions[0] - 0.5, -0.5, 3],
        [-0.5, dimensions[1] - 0.5, 3],
        [dimensions[0] - 0.5, dimensions[1] - 0.5, 3],
      ].map((voxel) => worldOfVoxel(series, voxel));

      [0, 1, 2].forEach((axis) => {
        const values = corners.map((corner) => corner[axis]);

        expect(bounds[2 * axis]).toBeCloseTo(Math.min(...values), 2);
        expect(bounds[2 * axis + 1]).toBeCloseTo(Math.max(...values), 2);
        expect(bounds[2 * axis]).not.toBeLessThan(volumeBounds[2 * axis]);
        expect(bounds[2 * axis + 1]).not.toBeGreaterThan(
          volumeBounds[2 * axis + 1]
        );
      });
    });

    it('gives the image data of each volume of a fusion by its volume id', async function () {
      const series = await createSeries({ id: 'fusionSource' });
      const overlay = await createSeries({
        plane: { ...STRAIGHT_PLANE, origin: [-4, 9, 22] },
        id: 'fusionOverlay',
      });
      const viewport = createNextViewport(renderingEngine, 'fusion');

      [series, overlay].forEach(({ imageIds, volumeId }, index) => {
        utilities.genericViewportDisplaySetMetadataProvider.add(
          `fusion:${index}`,
          { imageIds, volumeId }
        );
      });
      await viewport.setDisplaySets(
        {
          displaySetId: 'fusion:0',
          options: { orientation: OrientationAxis.ACQUISITION },
        },
        {
          displaySetId: 'fusion:1',
          options: {
            role: 'overlay',
            orientation: OrientationAxis.ACQUISITION,
          },
        }
      );
      await renderAndWait(viewport);

      const sourceBounds = viewport
        .getImageData(series.volumeId)
        .imageData.getBounds();
      const overlayBounds = viewport
        .getImageData(overlay.volumeId)
        .imageData.getBounds();

      expectPointsClose(sourceBounds, [-10.5, 21.5, 4.25, 40.25, 19, 35]);
      expectPointsClose(overlayBounds, [-4.5, 27.5, 8.25, 44.25, 21, 37]);
      expectPointsClose(
        viewport.getImageData().imageData.getBounds(),
        sourceBounds
      );

      const voxel = [6, 4, 2];

      expect(
        valueAtWorld(viewport, worldOfVoxel(series, voxel), series.volumeId)
      ).toBe(storedValue(voxel));
      expect(
        valueAtWorld(
          viewport,
          worldOfVoxel(overlay, [9, 4, 2]),
          overlay.volumeId
        )
      ).toBe(storedValue([9, 4, 2]));
      expect(
        valueAtWorld(
          viewport,
          worldOfVoxel(overlay, [9, 4, 2]),
          series.volumeId
        )
      ).toBe(storedValue([15, 7, 3]));
    });
  });

  describe('the slice on display', () => {
    it('gives the same width, height and pixels for a stack on the GPU, a stack on the CPU and a volume, and its matrix leads each pixel to its voxel', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const stackCpu = createNextViewport(renderingEngine, 'stackCpu');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 3);
      await showStack(stackCpu, series, 3, { renderBackend: 'cpu' });
      await showVolume(volume, series, 3);

      const volumeSlice = utilities.getCurrentVolumeViewportSlice(volume);

      expect(volumeSlice.width).toBe(32);
      expect(volumeSlice.height).toBe(24);
      expect(Array.from(volumeSlice.scalarData)).toEqual(
        storedSlicePixels(series, 3)
      );

      [
        [stack, 0],
        [stackCpu, 0],
        [volume, 3],
      ].forEach(([viewport, k]) => {
        const slice = utilities.getCurrentVolumeViewportSlice(viewport);
        const { voxelManager } = viewport.getImageData();

        expect(slice.width).toBe(volumeSlice.width);
        expect(slice.height).toBe(volumeSlice.height);
        expect(Array.from(slice.scalarData)).toEqual(
          Array.from(volumeSlice.scalarData)
        );
        SLICE_PIXELS.forEach(([x, y]) => {
          const index = indexOfSlicePixel(slice, [x, y]);

          expect(index).toEqual([x, y, k]);
          expect(voxelManager.getAtIJKPoint(index)).toBe(
            slice.scalarData[y * slice.width + x]
          );
          expectPointsClose(
            vec3.transformMat4(vec3.create(), index, slice.indexToSliceMatrix),
            [x, y, 0]
          );
        });
      });
    });

    it('gives the same slice for a flipped stack and a flipped volume: the pixels stay in the order of the image, and the matrix follows the view', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const volume = createNextViewport(renderingEngine, 'volume');

      await showStack(stack, series, 3);
      await showVolume(volume, series, 3);
      stack.setViewState({ flipHorizontal: true });
      volume.setViewState({ flipHorizontal: true });
      await renderAndWait(stack);
      await renderAndWait(volume);

      const stackSlice = utilities.getCurrentVolumeViewportSlice(stack);
      const volumeSlice = utilities.getCurrentVolumeViewportSlice(volume);

      expect(stackSlice.width).toBe(32);
      expect(stackSlice.height).toBe(24);
      expect(volumeSlice.width).toBe(32);
      expect(volumeSlice.height).toBe(24);
      expect(Array.from(stackSlice.scalarData)).toEqual(
        storedSlicePixels(series, 3)
      );
      expect(Array.from(volumeSlice.scalarData)).toEqual(
        storedSlicePixels(series, 3)
      );
      SLICE_PIXELS.forEach(([x, y]) => {
        expect(indexOfSlicePixel(stackSlice, [x, y])).toEqual([31 - x, y, 0]);
        expect(indexOfSlicePixel(volumeSlice, [x, y])).toEqual([31 - x, y, 3]);
      });
    });

    it('gives the image on display of a legacy stack viewport and of a legacy adapter in stack mode', async function () {
      const series = await createSeries();
      const legacy = createLegacyViewport(
        renderingEngine,
        'legacy',
        ViewportType.STACK
      );
      const adapter = createLegacyViewport(
        renderingEngine,
        'adapter',
        ViewportType.STACK,
        { adapter: true }
      );

      await legacy.setStack(series.imageIds, 3);
      await renderAndWait(legacy);
      await adapter.setStack(series.imageIds, 3);
      await renderAndWait(adapter);

      [legacy, adapter].forEach((viewport) => {
        const slice = utilities.getCurrentVolumeViewportSlice(viewport);

        expect(slice.width).toBe(32);
        expect(slice.height).toBe(24);
        expect(Array.from(slice.scalarData)).toEqual(
          storedSlicePixels(series, 3)
        );
        SLICE_PIXELS.forEach(([x, y]) => {
          expect(indexOfSlicePixel(slice, [x, y])).toEqual([x, y, 0]);
        });
      });
    });

    it('gives the pixels of the slice on display of a legacy volume viewport that looks against the slice axis, where its own member reads the mirror slice', async function () {
      const series = await createSeries();
      const legacy = createLegacyViewport(
        renderingEngine,
        'legacy',
        ViewportType.ORTHOGRAPHIC,
        { orientation: OrientationAxis.AXIAL }
      );

      await legacy.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(legacy);

      const camera = legacy.getCamera();
      const shift = worldOfVoxel(series, [0, 0, 2])[2] - camera.focalPoint[2];

      legacy.setCamera({
        focalPoint: [
          camera.focalPoint[0],
          camera.focalPoint[1],
          camera.focalPoint[2] + shift,
        ],
        position: [
          camera.position[0],
          camera.position[1],
          camera.position[2] + shift,
        ],
      });
      await renderAndWait(legacy);

      const slice = utilities.getCurrentVolumeViewportSlice(legacy);

      expect(legacy.getCamera().viewPlaneNormal[2]).toBe(-1);
      expect(legacy.getCurrentImageId()).toBe(series.imageIds[2]);
      expect(indexOfSlicePixel(slice, [5, 7])).toEqual([5, 7, 2]);
      expect(Array.from(slice.scalarData)).toEqual(
        storedSlicePixels(series, 2)
      );
      expect(Array.from(legacy.getCurrentSlicePixelData())).toEqual(
        storedSlicePixels(series, 5)
      );
    });
  });

  describe('the clipping planes of the slices', () => {
    [
      ['along the patient axes', STRAIGHT_PLANE],
      ['on a tilted series', TILTED_PLANE],
    ].forEach(([name, plane]) => {
      it(`gives a pair of planes around each image of a stack ${name}, the same as a volume of the series for the same slice on display, within 1e-3 mm`, async function () {
        const series = await createSeries({ plane });
        const stack = createNextViewport(renderingEngine, 'stack');
        const stackCpu = createNextViewport(renderingEngine, 'stackCpu');
        const volume = createNextViewport(renderingEngine, 'volume');

        await showStack(stack, series, 3);
        await showStack(stackCpu, series, 3, { renderBackend: 'cpu' });
        await showVolume(volume, series, 3);

        const stackPlanes = utilities.getSlicesClippingPlanes(stack);
        const volumePlanes = utilities.getSlicesClippingPlanes(volume);

        expect(stackPlanes.map(({ sliceIndex }) => sliceIndex)).toEqual([
          0, 1, 2, 3, 4, 5, 6, 7,
        ]);
        expect(volumePlanes.map(({ sliceIndex }) => sliceIndex)).toEqual([
          0, 1, 2, 3, 4, 5, 6, 7,
        ]);
        expect(utilities.getSlicesClippingPlanes(stackCpu)).toEqual(
          stackPlanes
        );
        stackPlanes.forEach((entry, k) => {
          expectPlanesAroundSlice(entry, series, k);
        });

        for (const k of [0, 3, 7]) {
          await showSliceOnBoth(stack, volume, series, k);

          expect(volume.getCurrentImageId()).toBe(stack.getCurrentImageId());
          expect(stack.getCurrentImageIdIndex()).toBe(k);
          expect(volume.getCurrentImageIdIndex()).toBe(7 - k);

          const stackEntry = stackPlanes[stack.getCurrentImageIdIndex()];
          const volumeEntry = utilities
            .getSlicesClippingPlanes(volume)
            .find(
              ({ sliceIndex }) => sliceIndex === volume.getCurrentImageIdIndex()
            );

          expectPlanesAroundSlice(volumeEntry, series, k);
          expectSamePlanes(stackEntry, volumeEntry);
        }
      });
    });

    it('gives an empty list for a viewport with nothing mounted', function () {
      const empty = createNextViewport(renderingEngine, 'empty');

      expect(empty.getCurrentMode()).toBe('empty');
      expect(utilities.getSlicesClippingPlanes(empty)).toEqual([]);
    });

    it('gives the planes of a legacy volume viewport by its own member, and those of a legacy stack viewport and of the legacy adapters as a next viewport', async function () {
      const series = await createSeries();
      const stack = createNextViewport(renderingEngine, 'stack');
      const volume = createNextViewport(renderingEngine, 'volume');
      const legacyStack = createLegacyViewport(
        renderingEngine,
        'legacyStack',
        ViewportType.STACK
      );
      const adapterStack = createLegacyViewport(
        renderingEngine,
        'adapterStack',
        ViewportType.STACK,
        { adapter: true }
      );
      const legacyVolume = createLegacyViewport(
        renderingEngine,
        'legacyVolume',
        ViewportType.ORTHOGRAPHIC,
        { orientation: OrientationAxis.AXIAL }
      );
      const adapterVolume = createLegacyViewport(
        renderingEngine,
        'adapterVolume',
        ViewportType.ORTHOGRAPHIC,
        { adapter: true, orientation: OrientationAxis.AXIAL }
      );

      await showStack(stack, series, 3);
      await showVolume(volume, series, 3);
      await legacyStack.setStack(series.imageIds, 3);
      await renderAndWait(legacyStack);
      await adapterStack.setStack(series.imageIds, 3);
      await renderAndWait(adapterStack);
      await legacyVolume.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(legacyVolume);
      await adapterVolume.setVolumes([{ volumeId: series.volumeId }]);
      await renderAndWait(adapterVolume);

      const stackPlanes = utilities.getSlicesClippingPlanes(stack);
      const volumePlanes = utilities.getSlicesClippingPlanes(volume);
      const legacyVolumePlanes =
        utilities.getSlicesClippingPlanes(legacyVolume);
      const adapterVolumePlanes =
        utilities.getSlicesClippingPlanes(adapterVolume);

      expect(stackPlanes.length).toBe(8);
      expect(utilities.getSlicesClippingPlanes(legacyStack)).toEqual(
        stackPlanes
      );
      expect(utilities.getSlicesClippingPlanes(adapterStack)).toEqual(
        stackPlanes
      );
      expect(legacyVolumePlanes).toEqual(
        legacyVolume.getSlicesClippingPlanes()
      );
      expect(legacyVolumePlanes.length).toBe(8);
      expect(adapterVolumePlanes.length).toBe(8);
      legacyVolumePlanes.forEach((entry, index) => {
        expect(adapterVolumePlanes[index].sliceIndex).toBe(entry.sliceIndex);
        expect(volumePlanes[index].sliceIndex).toBe(entry.sliceIndex);
        expectSamePlanes(adapterVolumePlanes[index], entry);
        expectSamePlanes(volumePlanes[index], entry);
      });
    });
  });

  describe('isInAcquisitionPlane', () => {
    it('is true for a stack on the GPU and on the CPU, true for a volume in its acquisition orientation, false for a volume in another orientation', async function () {
      const series = await createSeries({ plane: TILTED_PLANE });
      const stack = createNextViewport(renderingEngine, 'stack');
      const stackCpu = createNextViewport(renderingEngine, 'stackCpu');
      const acquisition = createNextViewport(renderingEngine, 'acquisition');
      const sagittal = createNextViewport(renderingEngine, 'sagittal');
      const oblique = createNextViewport(renderingEngine, 'oblique');

      await showStack(stack, series, 3);
      await showStack(stackCpu, series, 3, { renderBackend: 'cpu' });
      await showVolume(acquisition, series, 3);
      await showVolume(sagittal, series, 3, {
        orientation: OrientationAxis.SAGITTAL,
      });
      await showVolume(oblique, series, 3, {
        orientation: {
          viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
          viewUp: [0, -1, 0],
        },
      });

      expect(utilities.isInAcquisitionPlane(stack)).toBe(true);
      expect(utilities.isInAcquisitionPlane(stackCpu)).toBe(true);
      expect(utilities.isInAcquisitionPlane(acquisition)).toBe(true);
      expect(utilities.isInAcquisitionPlane(sagittal)).toBe(false);
      expect(utilities.isInAcquisitionPlane(oblique)).toBe(false);
    });

    it('is false for a viewport with nothing mounted', function () {
      const empty = createNextViewport(renderingEngine, 'empty');

      expect(utilities.isInAcquisitionPlane(empty)).toBe(false);
    });

    it('gives the answer of the member of a legacy viewport and of a legacy adapter', async function () {
      const series = await createSeries();
      const legacyStack = createLegacyViewport(
        renderingEngine,
        'legacyStack',
        ViewportType.STACK
      );
      const adapterStack = createLegacyViewport(
        renderingEngine,
        'adapterStack',
        ViewportType.STACK,
        { adapter: true }
      );
      const legacyAxial = createLegacyViewport(
        renderingEngine,
        'legacyAxial',
        ViewportType.ORTHOGRAPHIC,
        { orientation: OrientationAxis.AXIAL }
      );
      const legacySagittal = createLegacyViewport(
        renderingEngine,
        'legacySagittal',
        ViewportType.ORTHOGRAPHIC,
        { orientation: OrientationAxis.SAGITTAL }
      );
      const adapterAxial = createLegacyViewport(
        renderingEngine,
        'adapterAxial',
        ViewportType.ORTHOGRAPHIC,
        { adapter: true, orientation: OrientationAxis.AXIAL }
      );
      const adapterSagittal = createLegacyViewport(
        renderingEngine,
        'adapterSagittal',
        ViewportType.ORTHOGRAPHIC,
        { adapter: true, orientation: OrientationAxis.SAGITTAL }
      );

      await legacyStack.setStack(series.imageIds, 3);
      await renderAndWait(legacyStack);
      await adapterStack.setStack(series.imageIds, 3);
      await renderAndWait(adapterStack);

      for (const viewport of [
        legacyAxial,
        legacySagittal,
        adapterAxial,
        adapterSagittal,
      ]) {
        await viewport.setVolumes([{ volumeId: series.volumeId }]);
        await renderAndWait(viewport);
      }

      [
        [legacyStack, true],
        [adapterStack, true],
        [legacyAxial, true],
        [legacySagittal, false],
        [adapterAxial, true],
        [adapterSagittal, false],
      ].forEach(([viewport, expected]) => {
        expect(viewport.isInAcquisitionPlane()).toBe(expected);
        expect(utilities.isInAcquisitionPlane(viewport)).toBe(expected);
      });
    });

    it('is true for a viewport that shows one image plane without the member, and false for 3D content', function () {
      const standIn = (mode) => ({ getCurrentMode: () => mode });

      expect(utilities.isInAcquisitionPlane(standIn('video'))).toBe(true);
      expect(utilities.isInAcquisitionPlane(standIn('wholeSlide'))).toBe(true);
      expect(utilities.isInAcquisitionPlane(standIn('volume3d'))).toBe(false);
      expect(utilities.isInAcquisitionPlane(standIn('ecg'))).toBe(false);
    });
  });
});
