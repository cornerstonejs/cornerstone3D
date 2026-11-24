import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader, viewportProjection } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  CrosshairsTool,
  ToolGroupManager,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'crosshairsHandlesNext';
const viewportIds = ['AXIAL', 'SAGITTAL', 'CORONAL'];
const canvasSize = 256;

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 64,
  columns: 64,
  slices: 64,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

/** A second volume of the same size, for a viewport that shows two volumes. */
const secondVolumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  id: 'secondVolume',
  rows: 64,
  columns: 64,
  slices: 64,
  xSpacing: 1,
  ySpacing: 1,
  zSpacing: 1,
});

/**
 * The volumes that got the slab of `setSlabThickness(5)` of the legacy volume
 * viewport at commit `58914567b`, of a viewport that showed two volumes: every
 * `vtkVolume` actor without `filterActorUIDs`, and only the named actors with
 * it.
 */
const LEGACY_SLAB_VOLUMES = { unfiltered: 2, filtered: 1 };

/**
 * Values of the legacy volume viewport (`ORTHOGRAPHIC`) at commit
 * `58914567b`, measured in the same scene with the same drag: three viewports
 * of 256 by 256 pixels, the same volume, the crosshairs tool active before the
 * volume is shown. The views of the next viewports at the start are the same
 * as the legacy ones.
 */
const legacy = {
  start: {
    toolCenter: [32, 32, 32],
    AXIAL: {
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
      focalPoint: [31.5, 31.5, 32],
      centerCanvas: [130, 130],
    },
    SAGITTAL: {
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, 0, 1],
      focalPoint: [32, 31.5, 31.5],
      centerCanvas: [130, 126],
    },
    CORONAL: {
      viewPlaneNormal: [0, -1, 0],
      viewUp: [0, 0, 1],
      focalPoint: [31.5, 32, 31.5],
      centerCanvas: [130, 126],
    },
    parallelScale: 32,
  },
  rotationDrag: {
    handle: [55, 130],
    target: [34, 100],
  },
  afterRotation: {
    SAGITTAL: {
      viewPlaneNormal: [0.955336, 0.29552, 0],
      viewUp: [0, 0, 1],
      focalPoint: [32.14776, 31.522332, 31.5],
    },
    CORONAL: {
      viewPlaneNormal: [0.29552, -0.955336, 0],
      viewUp: [0, 0, 1],
      focalPoint: [31.522332, 31.85224, 31.5],
    },
    axialLines: {
      SAGITTAL: [
        [
          [135.9104, 110.8933],
          [170.2137, 0],
        ],
        [
          [124.0896, 149.1067],
          [91.0236, 256],
        ],
      ],
      CORONAL: [
        [
          [110.8933, 124.0896],
          [0, 89.7863],
        ],
        [
          [149.1067, 135.9104],
          [256, 168.9764],
        ],
      ],
    },
  },
  slabDrag: {
    handle: [181, 130],
    target: [181, 110],
  },
  afterSlabDrag: {
    coronalSlabThickness: 5.05,
    axialSlabLineRows: [109.8, 150.2],
  },
  startSlabLineRows: [129.8, 130.2],
  autoPan: {
    sagittalZoom: 4,
    sagittalCenterCanvasAfterZoom: [136, 120],
    toolCenterAfterScroll: [32, 32, 12],
    sagittalCenterCanvasAfterScroll: [136, 246],
    sagittalParallelScale: 8,
    coronalCenterCanvasAfterScroll: [130, 206],
  },
};

/**
 * How far the centre of the crosshairs may be from the legacy one after a
 * turn, in mm. The centre is worked out from the view references of the
 * viewports. The view reference of a next viewport puts a turned plane on the
 * nearest slice of the volume along its normal, at most half the spacing
 * (1 mm here) from the plane on display.
 */
const turnedCentreTolerance = 0.5;

/**
 * How far a line of a turned viewport may be from the legacy one, in canvas
 * pixels: the centre tolerance at 4 pixels for each mm.
 */
const turnedLineTolerance = 2;

/** Expects two lists of numbers to differ by no more than a tolerance. */
function expectClose(actual, expected, tolerance) {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, index) => {
    expect(Math.abs(actual[index] - value)).toBeLessThanOrEqual(tolerance);
  });
}

/** The camera that the resolved view of a next viewport gives. */
function getCamera(viewport) {
  return viewport.getResolvedView().toICamera();
}

/** The crosshairs tool of the tool group of the test. */
function getCrosshairs() {
  return ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(
    CrosshairsTool.toolName
  );
}

/** The crosshairs annotation that the tool draws on the axial viewport. */
function getAxialAnnotation(element) {
  return annotation.state
    .getAnnotations(CrosshairsTool.toolName, element)
    .find(({ data }) => data.viewportId === 'AXIAL');
}

/**
 * The two parts of the line of another viewport in the axial viewport, in
 * canvas points: the start and the end of each part.
 */
function getAxialLines(element, otherViewportId) {
  return getAxialAnnotation(element)
    .data.handles.rotationPoints.filter(
      ([, otherViewport]) => otherViewport.id === otherViewportId
    )
    .map(([, , start, end]) => [Array.from(start), Array.from(end)]);
}

/**
 * The canvas rows of the dashed slab lines of the coronal viewport in the
 * axial viewport, which are horizontal there, without repeats.
 */
function getAxialCoronalSlabLineRows(element) {
  const rows = getAxialAnnotation(element)
    .data.handles.slabThicknessPoints.filter(
      ([, otherViewport]) => otherViewport.id === 'CORONAL'
    )
    .flatMap(([, , start, end]) => [start[1], end[1]]);

  return [...new Set(rows.map((row) => Number(row.toFixed(4))))].sort(
    (a, b) => a - b
  );
}

/** The presentation of the source display set of a next viewport. */
function getSourcePresentation(viewport) {
  return (
    viewport.getDisplaySetPresentation(viewport.getSourceDisplaySetId()) || {}
  );
}

/**
 * Resolves when the annotations of each element are drawn once more, or after
 * a timeout when one of them is not drawn.
 */
function waitForAnnotationsRendered(elements, timeout = 2000) {
  return Promise.race([
    Promise.all(
      elements.map(
        (element) =>
          new Promise((resolve) => {
            element.addEventListener(
              csToolsEvents.ANNOTATION_RENDERED,
              resolve,
              { once: true }
            );
          })
      )
    ),
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);
}

/** The client point of a canvas point of an element. */
function getClientPoint(element, canvasPoint) {
  const rect = element.getBoundingClientRect();

  return [canvasPoint[0] + rect.left, canvasPoint[1] + rect.top];
}

/**
 * Drags the left mouse button on an element from one canvas point to
 * another, in one move.
 */
function drag(element, fromCanvas, toCanvas) {
  const [fromX, fromY] = getClientPoint(element, fromCanvas);
  const [toX, toY] = getClientPoint(element, toCanvas);

  element.dispatchEvent(
    new MouseEvent('mousedown', {
      buttons: 1,
      clientX: fromX,
      clientY: fromY,
      bubbles: true,
    })
  );
  document.dispatchEvent(
    new MouseEvent('mousemove', { buttons: 1, clientX: toX, clientY: toY })
  );
  document.dispatchEvent(
    new MouseEvent('mouseup', { clientX: toX, clientY: toY })
  );
}

/**
 * Makes an axial, a sagittal and a coronal direct next planar viewport, shows
 * the volumes on each and waits for the first drawing of the crosshairs.
 */
async function mountViewports(renderingEngine, volumeIds = [volumeId]) {
  const elements = testUtils.createViewports(
    renderingEngine,
    [
      OrientationAxis.AXIAL,
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
    ].map((orientation, index) => ({
      viewportType: ViewportType.PLANAR,
      width: canvasSize,
      height: canvasSize,
      viewportId: viewportIds[index],
      orientation,
    })),
    3
  );
  const annotationsRendered = waitForAnnotationsRendered(elements);

  for (const id of volumeIds) {
    await volumeLoader.createAndCacheVolume(id, { imageIds: [] });
  }
  await testUtils.setVolumesOnNextViewports(
    renderingEngine,
    volumeIds,
    viewportIds
  );
  renderingEngine.render();
  await annotationsRendered;

  return elements;
}

/**
 * Drags the rotation handle of the coronal line in the axial viewport by 0.3
 * radians about the centre, to a point 100 pixels from it, as the legacy
 * measurement did.
 */
async function dragCoronalRotationHandle(renderingEngine, elements) {
  const axial = renderingEngine.getViewport('AXIAL');
  const [handleWorld] = getAxialAnnotation(
    elements[0]
  ).data.handles.rotationPoints.find(
    ([, otherViewport]) => otherViewport.id === 'CORONAL'
  );
  const handle = axial.worldToCanvas(handleWorld).map(Math.round);
  const center = axial.worldToCanvas(getCrosshairs().toolCenter);
  const direction = [handle[0] - center[0], handle[1] - center[1]];
  const length = Math.hypot(direction[0], direction[1]);
  const angle = 0.3;
  const radius = 100;
  const target = [
    Math.round(
      center[0] +
        ((Math.cos(angle) * direction[0] - Math.sin(angle) * direction[1]) /
          length) *
          radius
    ),
    Math.round(
      center[1] +
        ((Math.sin(angle) * direction[0] + Math.cos(angle) * direction[1]) /
          length) *
          radius
    ),
  ];
  const annotationsRendered = waitForAnnotationsRendered(elements);

  drag(elements[0], handle, target);
  await annotationsRendered;

  return { handle, target };
}

/**
 * Drags the first slab handle of the coronal line in the axial viewport 20
 * pixels away from the line, to the side of the handle, as the legacy
 * measurement did.
 */
async function dragCoronalSlabHandle(renderingEngine, elements) {
  const axial = renderingEngine.getViewport('AXIAL');
  const slabPoints = getAxialAnnotation(
    elements[0]
  ).data.handles.slabThicknessPoints.filter(
    ([, otherViewport]) => otherViewport.id === 'CORONAL'
  );
  const first = axial.worldToCanvas(slabPoints[0][0]);
  const third = axial.worldToCanvas(slabPoints[2][0]);
  const side = [first[0] - third[0], first[1] - third[1]];
  const sideLength = Math.hypot(side[0], side[1]);
  const handle = first.map(Math.round);
  const target = [
    Math.round(handle[0] + (side[0] / sideLength) * 20),
    Math.round(handle[1] + (side[1] / sideLength) * 20),
  ];
  const annotationsRendered = waitForAnnotationsRendered(elements);

  drag(elements[0], handle, target);
  await annotationsRendered;

  return { handle, target };
}

describe('The handles of CrosshairsTool on direct next planar viewports in volume mode -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      viewportIds,
      tools: [CrosshairsTool],
      toolConfigurations: {
        [CrosshairsTool.toolName]: { volumeId },
      },
      toolActivations: {
        [CrosshairsTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('start with the views of the legacy volume viewport', async function () {
    await mountViewports(renderingEngine);

    expectClose(getCrosshairs().toolCenter, legacy.start.toolCenter, 1e-3);
    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const camera = getCamera(viewport);
      const expected = legacy.start[viewportId];

      expectClose(camera.viewPlaneNormal, expected.viewPlaneNormal, 1e-6);
      expectClose(camera.viewUp, expected.viewUp, 1e-6);
      expectClose(camera.focalPoint, expected.focalPoint, 1e-3);
      expect(camera.parallelScale).toBeCloseTo(legacy.start.parallelScale, 6);
      expectClose(
        viewport.worldToCanvas(getCrosshairs().toolCenter),
        expected.centerCanvas,
        1e-3
      );
    });
  });

  it('turn the other two viewports about the centre by the angle of a drag of a rotation handle, as the legacy volume viewport did', async function () {
    const elements = await mountViewports(renderingEngine);
    const { handle, target } = await dragCoronalRotationHandle(
      renderingEngine,
      elements
    );

    expect(handle).toEqual(legacy.rotationDrag.handle);
    expect(target).toEqual(legacy.rotationDrag.target);
    expectClose(
      getCrosshairs().toolCenter,
      legacy.start.toolCenter,
      turnedCentreTolerance
    );

    const axialCamera = getCamera(renderingEngine.getViewport('AXIAL'));
    expectClose(
      axialCamera.viewPlaneNormal,
      legacy.start.AXIAL.viewPlaneNormal,
      1e-6
    );
    expectClose(axialCamera.focalPoint, legacy.start.AXIAL.focalPoint, 1e-3);

    ['SAGITTAL', 'CORONAL'].forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const camera = getCamera(viewport);
      const expected = legacy.afterRotation[viewportId];

      expectClose(camera.viewPlaneNormal, expected.viewPlaneNormal, 1e-5);
      expectClose(camera.viewUp, expected.viewUp, 1e-5);
      expectClose(camera.focalPoint, expected.focalPoint, 1e-3);
      expect(camera.parallelScale).toBeCloseTo(legacy.start.parallelScale, 4);
      expectClose(
        viewport.worldToCanvas(legacy.start.toolCenter),
        legacy.start[viewportId].centerCanvas,
        1e-3
      );
    });
  });

  it('draw the lines of the turned viewports where the legacy volume viewport drew them', async function () {
    const elements = await mountViewports(renderingEngine);

    await dragCoronalRotationHandle(renderingEngine, elements);

    ['SAGITTAL', 'CORONAL'].forEach((viewportId) => {
      const lines = getAxialLines(elements[0], viewportId);
      const expected = legacy.afterRotation.axialLines[viewportId];

      expect(lines.length).toBe(expected.length);
      lines.forEach((line, index) => {
        expectClose(line[0], expected[index][0], turnedLineTolerance);
        expectClose(line[1], expected[index][1], turnedLineTolerance);
      });
    });
  });

  it('bring the orientations back with resetCrosshairs', async function () {
    const elements = await mountViewports(renderingEngine);

    await dragCoronalRotationHandle(renderingEngine, elements);
    expectClose(
      getCamera(renderingEngine.getViewport('SAGITTAL')).viewPlaneNormal,
      legacy.afterRotation.SAGITTAL.viewPlaneNormal,
      1e-5
    );

    const annotationsRendered = waitForAnnotationsRendered(elements);
    getCrosshairs().resetCrosshairs();
    await annotationsRendered;

    expectClose(getCrosshairs().toolCenter, legacy.start.toolCenter, 1e-3);
    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      const camera = getCamera(viewport);
      const expected = legacy.start[viewportId];

      expectClose(camera.viewPlaneNormal, expected.viewPlaneNormal, 1e-6);
      expectClose(camera.viewUp, expected.viewUp, 1e-6);
      expectClose(camera.focalPoint, expected.focalPoint, 1e-3);
      expect(camera.parallelScale).toBeCloseTo(legacy.start.parallelScale, 6);
    });
  });

  it('set the slab of the viewport of a line with a drag of its slab handle, as the legacy volume viewport did, and draw the slab lines there', async function () {
    const elements = await mountViewports(renderingEngine);

    expect(getAxialCoronalSlabLineRows(elements[0])).toEqual(
      legacy.startSlabLineRows
    );

    const { handle, target } = await dragCoronalSlabHandle(
      renderingEngine,
      elements
    );

    expect(handle).toEqual(legacy.slabDrag.handle);
    expect(target).toEqual(legacy.slabDrag.target);

    const coronal = getSourcePresentation(
      renderingEngine.getViewport('CORONAL')
    );

    expect(coronal.slabThickness).toBeCloseTo(
      legacy.afterSlabDrag.coronalSlabThickness,
      4
    );
    expect(coronal.blendMode).toBeUndefined();
    ['AXIAL', 'SAGITTAL'].forEach((viewportId) => {
      expect(
        getSourcePresentation(renderingEngine.getViewport(viewportId))
          .slabThickness
      ).toBeUndefined();
    });
    expectClose(
      getAxialCoronalSlabLineRows(elements[0]),
      legacy.afterSlabDrag.axialSlabLineRows,
      1e-3
    );
  });

  it('take the slab back with resetCrosshairs, as the legacy volume viewport did', async function () {
    const elements = await mountViewports(renderingEngine);

    await dragCoronalSlabHandle(renderingEngine, elements);
    expect(
      getSourcePresentation(renderingEngine.getViewport('CORONAL'))
        .slabThickness
    ).toBeCloseTo(legacy.afterSlabDrag.coronalSlabThickness, 4);

    const annotationsRendered = waitForAnnotationsRendered(elements);
    getCrosshairs().resetCrosshairs();
    await annotationsRendered;

    expect(
      utilities.getViewSlabDepth(
        getSourcePresentation(renderingEngine.getViewport('CORONAL'))
          .slabThickness
      )
    ).toBeUndefined();
    expect(getAxialCoronalSlabLineRows(elements[0])).toEqual(
      legacy.startSlabLineRows
    );
  });

  it('give the slab of a slab handle to every volume of a viewport that shows two, as the legacy volume viewport did, and only to the named ones with filterActorUIDsToSetSlabThickness', async function () {
    await mountViewports(renderingEngine, [volumeId, secondVolumeId]);

    const coronal = renderingEngine.getViewport('CORONAL');
    const crosshairs = getCrosshairs();
    const countSlabbed = () =>
      coronal
        .getDisplaySets()
        .filter(
          ({ displaySetId }) =>
            coronal.getDisplaySetPresentation(displaySetId)?.slabThickness === 5
        ).length;

    crosshairs.setSlabThickness(coronal, 5);
    const unfiltered = countSlabbed();

    coronal.getDisplaySets().forEach(({ displaySetId }) => {
      coronal.setDisplaySetPresentation(displaySetId, {
        slabThickness: undefined,
      });
    });
    crosshairs.configuration.filterActorUIDsToSetSlabThickness = [
      secondVolumeId,
    ];
    crosshairs.setSlabThickness(coronal, 5);
    const filtered = countSlabbed();

    crosshairs.configuration.filterActorUIDsToSetSlabThickness = [];

    expect(coronal.getDisplaySets().length).toBe(2);
    expect({ unfiltered, filtered }).toEqual(LEGACY_SLAB_VOLUMES);
  });

  it('pan a viewport whose centre would leave the canvas when the centre moves, with autoPan on, as the legacy volume viewport did', async function () {
    const elements = await mountViewports(renderingEngine);

    ToolGroupManager.getToolGroup(toolGroupId).setToolConfiguration(
      CrosshairsTool.toolName,
      { autoPan: { enabled: true, panSize: 10 } }
    );

    const sagittal = renderingEngine.getViewport('SAGITTAL');
    const coronal = renderingEngine.getViewport('CORONAL');

    sagittal.setViewState(
      viewportProjection.withPresentation(sagittal, {
        zoom: legacy.autoPan.sagittalZoom,
      })
    );
    expectClose(
      sagittal.worldToCanvas(getCrosshairs().toolCenter),
      legacy.autoPan.sagittalCenterCanvasAfterZoom,
      1e-3
    );

    const annotationsRendered = waitForAnnotationsRendered(elements);
    await utilities.scroll(renderingEngine.getViewport('AXIAL'), {
      delta: 20,
    });
    await annotationsRendered;

    const { toolCenter } = getCrosshairs();

    expectClose(toolCenter, legacy.autoPan.toolCenterAfterScroll, 1e-3);
    expectClose(
      sagittal.worldToCanvas(toolCenter),
      legacy.autoPan.sagittalCenterCanvasAfterScroll,
      1e-3
    );
    expect(getCamera(sagittal).parallelScale).toBeCloseTo(
      legacy.autoPan.sagittalParallelScale,
      6
    );
    expectClose(
      coronal.worldToCanvas(toolCenter),
      legacy.autoPan.coronalCenterCanvasAfterScroll,
      1e-3
    );
  });

  it('pan no viewport when the centre moves with autoPan off', async function () {
    const elements = await mountViewports(renderingEngine);
    const sagittal = renderingEngine.getViewport('SAGITTAL');

    sagittal.setViewState(
      viewportProjection.withPresentation(sagittal, {
        zoom: legacy.autoPan.sagittalZoom,
      })
    );

    const annotationsRendered = waitForAnnotationsRendered(elements);
    await utilities.scroll(renderingEngine.getViewport('AXIAL'), {
      delta: 20,
    });
    await annotationsRendered;

    expectClose(
      getCrosshairs().toolCenter,
      legacy.autoPan.toolCenterAfterScroll,
      1e-3
    );
    expect(
      sagittal.worldToCanvas(getCrosshairs().toolCenter)[1]
    ).toBeGreaterThan(canvasSize);
  });
});
