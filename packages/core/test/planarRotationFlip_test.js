import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/GenericViewport/Planar/planarSampledSliceRest';
import {
  createNextViewport,
  createSeries,
  expectPointsClose,
  renderAndWait,
  showStack,
  showVolume,
  storedValue,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { utilities, viewportProjection, Enums } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The world distance, in mm, of the points whose canvas offsets are read. */
const STEP = 4;

/**
 * What the 5.x legacy stack and volume viewports gave, measured on the legacy
 * tree of 58914567b with the same series, axial, on 400 by 300 pixels, after
 * `setViewPresentation({ rotation, flipHorizontal, flipVertical })`: the view
 * up and the view plane normal of the camera, and the canvas offsets from the
 * focal point of the world points STEP mm along x and along y. The stack and
 * the volume gave the same numbers. `getViewPresentation()` and
 * `getRotation()` gave the rotation and the flips as written, and writing
 * back the presentation that was read gave the same view.
 */
const LEGACY_PRESENTATION = {
  30: {
    none: {
      viewUp: [-0.5, -0.866025, 0],
      viewPlaneNormal: [0, 0, -1],
      canvasOfX: [28.867513, 16.666667],
      canvasOfY: [-16.666667, 28.867513],
    },
    H: {
      viewUp: [0.5, -0.866025, 0],
      viewPlaneNormal: [0, 0, 1],
      canvasOfX: [-28.867513, -16.666667],
      canvasOfY: [-16.666667, 28.867513],
    },
    V: {
      viewUp: [-0.5, 0.866025, 0],
      viewPlaneNormal: [0, 0, 1],
      canvasOfX: [28.867513, 16.666667],
      canvasOfY: [16.666667, -28.867513],
    },
    HV: {
      viewUp: [0.5, 0.866025, 0],
      viewPlaneNormal: [0, 0, -1],
      canvasOfX: [-28.867513, -16.666667],
      canvasOfY: [16.666667, -28.867513],
    },
  },
  90: {
    none: {
      viewUp: [-1, 0, 0],
      viewPlaneNormal: [0, 0, -1],
      canvasOfX: [0, 33.333333],
      canvasOfY: [-33.333333, 0],
    },
    H: {
      viewUp: [1, 0, 0],
      viewPlaneNormal: [0, 0, 1],
      canvasOfX: [0, -33.333333],
      canvasOfY: [-33.333333, 0],
    },
    V: {
      viewUp: [-1, 0, 0],
      viewPlaneNormal: [0, 0, 1],
      canvasOfX: [0, 33.333333],
      canvasOfY: [33.333333, 0],
    },
    HV: {
      viewUp: [1, 0, 0],
      viewPlaneNormal: [0, 0, -1],
      canvasOfX: [0, -33.333333],
      canvasOfY: [33.333333, 0],
    },
  },
};

/**
 * What the same 5.x viewports gave when a flip was written alone on a turned
 * view, by `setViewPresentation({ flipHorizontal })` or by
 * `setCamera({ flipHorizontal })`: the picture is mirrored on the screen, so
 * the rotation reads 360 minus the rotation for each flip that changes. A
 * rotation written alone on a flipped view turns the flipped picture.
 */
const LEGACY_SEQUENCES = {
  rotation30ThenH: {
    rotation: 330,
    flipHorizontal: true,
    flipVertical: false,
    viewUp: [-0.5, -0.866025, 0],
    viewPlaneNormal: [0, 0, 1],
    canvasOfX: [-28.867513, 16.666667],
    canvasOfY: [16.666667, 28.867513],
  },
  rotation30ThenHThenV: {
    rotation: 30,
    flipHorizontal: true,
    flipVertical: true,
    ...LEGACY_PRESENTATION[30].HV,
  },
  rotation30ThenV: {
    rotation: 330,
    flipHorizontal: false,
    flipVertical: true,
    viewUp: [0.5, 0.866025, 0],
    viewPlaneNormal: [0, 0, 1],
    canvasOfX: [28.867513, -16.666667],
    canvasOfY: [-16.666667, -28.867513],
  },
  rotation30ThenHThenNoH: {
    rotation: 30,
    flipHorizontal: false,
    flipVertical: false,
    ...LEGACY_PRESENTATION[30].none,
  },
  hThenRotation30: {
    rotation: 30,
    flipHorizontal: true,
    flipVertical: false,
    ...LEGACY_PRESENTATION[30].H,
  },
  hThenRotation90: {
    rotation: 90,
    flipHorizontal: true,
    flipVertical: false,
    ...LEGACY_PRESENTATION[90].H,
  },
  rotation90ThenV: {
    rotation: 270,
    flipHorizontal: false,
    flipVertical: true,
    viewUp: [1, 0, 0],
    viewPlaneNormal: [0, 0, 1],
    canvasOfX: [0, -33.333333],
    canvasOfY: [-33.333333, 0],
  },
};

const FLIPS = [
  { name: 'none', flipHorizontal: false, flipVertical: false },
  { name: 'H', flipHorizontal: true, flipVertical: false },
  { name: 'V', flipHorizontal: false, flipVertical: true },
  { name: 'HV', flipHorizontal: true, flipVertical: true },
];

const MODES = [
  { mode: 'stack', show: showStack },
  { mode: 'volume', show: showVolume },
];

/** Shows the series on a new next planar viewport at its image 2. */
async function showSeries(renderingEngine, id, show) {
  const series = await createSeries({ id });
  const viewport = createNextViewport(renderingEngine, id);

  await show(viewport, series, 2);

  return viewport;
}

/** Writes a presentation through the projection service and renders. */
async function writePresentation(viewport, presentation) {
  viewport.setViewState(
    viewportProjection.withPresentation(viewport, presentation)
  );
  await renderAndWait(viewport);
}

/** Writes a view state patch and renders. */
async function writeViewState(viewport, viewStatePatch) {
  viewport.setViewState(viewStatePatch);
  await renderAndWait(viewport);
}

/** The canvas offset from the focal point of a world point near it. */
function canvasOffset(viewport, focalPoint, worldOffset) {
  const origin = viewport.worldToCanvas(focalPoint);
  const point = viewport.worldToCanvas(
    focalPoint.map((value, axis) => value + worldOffset[axis])
  );

  return [point[0] - origin[0], point[1] - origin[1]];
}

/** Checks the camera vectors and the canvas offsets of a view. */
function expectView(viewport, expected) {
  const camera = viewport.getResolvedView().toICamera();

  expectPointsClose(camera.viewUp, expected.viewUp, 5);
  expectPointsClose(camera.viewPlaneNormal, expected.viewPlaneNormal, 5);
  expectPointsClose(
    canvasOffset(viewport, camera.focalPoint, [STEP, 0, 0]),
    expected.canvasOfX,
    3
  );
  expectPointsClose(
    canvasOffset(viewport, camera.focalPoint, [0, STEP, 0]),
    expected.canvasOfY,
    3
  );
}

/** Checks the rotation and the flips that a view reads back. */
function expectPresentation(viewport, expected) {
  const presentation = viewportProjection.getPresentation(viewport);

  expect(presentation.rotation).toBeCloseTo(expected.rotation, 6);
  expect(presentation.flipHorizontal).toBe(expected.flipHorizontal);
  expect(presentation.flipVertical).toBe(expected.flipVertical);
  expect(viewport.getRotation()).toBeCloseTo(expected.rotation, 6);
}

/** Checks a view against what the 5.x viewport read and showed. */
function expectLegacy(viewport, expected) {
  expectPresentation(viewport, expected);
  expectView(viewport, expected);
}

describe('A planar view turns and flips as the 5.x viewports did -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  MODES.forEach(({ mode, show }) => {
    [30, 90].forEach((rotation) => {
      FLIPS.forEach(({ name, flipHorizontal, flipVertical }) => {
        it(`shows rotation ${rotation} with the flips ${name} as 5.x in ${mode} mode, and reads them back`, async function () {
          const viewport = await showSeries(
            renderingEngine,
            `turnFlip${mode}${rotation}${name}`,
            show
          );
          const expected = {
            rotation,
            flipHorizontal,
            flipVertical,
            ...LEGACY_PRESENTATION[rotation][name],
          };

          await writePresentation(viewport, {
            rotation,
            flipHorizontal,
            flipVertical,
          });

          expectLegacy(viewport, expected);

          await writePresentation(
            viewport,
            viewportProjection.getPresentation(viewport)
          );

          expectLegacy(viewport, expected);
        });
      });
    });

    it(`mirrors a turned view on the screen by a flip written alone through the presentation in ${mode} mode, as 5.x setViewPresentation did`, async function () {
      const viewport = await showSeries(
        renderingEngine,
        `presentationFlipAlone${mode}`,
        show
      );

      await writePresentation(viewport, { rotation: 30 });
      await writePresentation(viewport, { flipHorizontal: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenH);

      await writePresentation(viewport, { flipVertical: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenHThenV);
    });

    it(`mirrors a turned view on the screen by a vertical flip written alone through the presentation in ${mode} mode`, async function () {
      const viewport = await showSeries(
        renderingEngine,
        `presentationFlipVAlone${mode}`,
        show
      );

      await writePresentation(viewport, { rotation: 30 });
      await writePresentation(viewport, { flipVertical: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenV);
    });

    it(`turns a flipped view by a rotation written alone in ${mode} mode, as 5.x did`, async function () {
      const viewport = await showSeries(
        renderingEngine,
        `presentationTurnFlipped${mode}`,
        show
      );

      await writePresentation(viewport, { flipHorizontal: true });
      await writePresentation(viewport, { rotation: 30 });

      expectLegacy(viewport, LEGACY_SEQUENCES.hThenRotation30);

      await writePresentation(viewport, { rotation: 90 });

      expectLegacy(viewport, LEGACY_SEQUENCES.hThenRotation90);
    });

    it(`mirrors a turned view on the screen by a flip of the view state alone in ${mode} mode, as 5.x setCamera did`, async function () {
      const viewport = await showSeries(
        renderingEngine,
        `viewStateFlipAlone${mode}`,
        show
      );

      await writeViewState(viewport, { rotation: 30 });
      await writeViewState(viewport, { flipHorizontal: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenH);

      await writeViewState(viewport, { flipHorizontal: false });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenHThenNoH);

      await writeViewState(viewport, { flipVertical: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation30ThenV);
    });

    it(`mirrors a view turned by 90 on the screen by a vertical flip of the view state alone in ${mode} mode, as 5.x setCamera did`, async function () {
      const viewport = await showSeries(
        renderingEngine,
        `viewStateFlipV90${mode}`,
        show
      );

      await writeViewState(viewport, { rotation: 90 });
      await writeViewState(viewport, { flipVertical: true });

      expectLegacy(viewport, LEGACY_SEQUENCES.rotation90ThenV);
    });
  });
});

/** The voxels whose canvas points the CPU and the GPU pictures are read at. */
const PROBE_VOXELS = [
  [8, 6],
  [20, 6],
  [8, 16],
  [22, 18],
  [16, 12],
];

/** The largest difference of a grey level between the two pictures. */
const GREY_TOLERANCE = 3;

/** Shows the series on a planar viewport of 400 by 300 with a backend. */
async function showStackWithBackend(
  renderingEngine,
  viewportId,
  series,
  backend
) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    background: [0, 0, 0],
    useEnableElement: true,
  });

  const viewport = renderingEngine.getViewport(viewportId);

  await showStack(viewport, series, 2, { renderBackend: backend });
  viewport.setDisplaySetPresentation(`stack:${viewportId}`, {
    voiRange: { lower: 0, upper: 255 },
    interpolationType: Enums.InterpolationType.NEAREST,
  });
  await renderAndWait(viewport);

  return viewport;
}

/** The red value of the pixel of the visible canvas at a canvas point. */
function readRedAt(viewport, canvasPoint) {
  const canvas = Array.from(viewport.element.querySelectorAll('canvas')).find(
    (element) => element.style.display !== 'none' && element.width
  );
  const ratio = canvas.width / viewport.element.clientWidth;

  return canvas
    .getContext('2d')
    .getImageData(
      Math.round(canvasPoint[0] * ratio),
      Math.round(canvasPoint[1] * ratio),
      1,
      1
    ).data[0];
}

/** Waits for the draws at rest and the frames of the rendering engine. */
async function waitForDraws() {
  await new Promise((resolve) =>
    setTimeout(resolve, 3 * SAMPLED_SLICE_REST_DELAY_MS)
  );

  for (let frame = 0; frame < 3; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

describe('A turned and flipped stack on the CPU path -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  FLIPS.filter(({ name }) => name === 'H' || name === 'V').forEach(
    ({ name, flipHorizontal, flipVertical }) => {
      it(`shows each voxel at the canvas point of its world point, as the GPU path, with rotation 30 and the flip ${name}`, async function () {
        const series = await createSeries({ id: `cpuTurnFlip${name}` });
        const gpu = await showStackWithBackend(
          renderingEngine,
          `gpuTurnFlip${name}`,
          series,
          'gpu'
        );
        const cpu = await showStackWithBackend(
          renderingEngine,
          `cpuTurnFlip${name}`,
          series,
          'cpu'
        );
        const view = { rotation: 30, flipHorizontal, flipVertical };

        await writePresentation(gpu, view);
        await writePresentation(cpu, view);
        await waitForDraws();

        expect(gpu.getRenderPlan()[0].renderMode).toBe('vtkImage');
        expect(cpu.getRenderPlan()[0].renderMode).toBe('cpuImage');

        PROBE_VOXELS.forEach(([i, j]) => {
          const world = worldOfVoxel(series, [i, j, 2]);
          const gpuGrey = readRedAt(gpu, gpu.worldToCanvas(world));
          const cpuGrey = readRedAt(cpu, cpu.worldToCanvas(world));

          const stored = storedValue([i, j, 2]);

          expect(Math.abs(gpuGrey - stored))
            .withContext(`voxel ${i}, ${j} on the GPU: ${gpuGrey}, ${stored}`)
            .toBeLessThanOrEqual(GREY_TOLERANCE);
          expect(Math.abs(cpuGrey - stored))
            .withContext(`voxel ${i}, ${j} on the CPU: ${cpuGrey}, ${stored}`)
            .toBeLessThanOrEqual(GREY_TOLERANCE);
        });
      }, 30000);
    }
  );
});
