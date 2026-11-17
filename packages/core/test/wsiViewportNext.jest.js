import { describe, it, expect, afterEach } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/GenericViewport/WSI/WSIViewport';
import WSIViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/WSI/WSIViewportLegacyAdapter';
import { viewportProjection } from '../src/RenderingEngine/GenericViewport/viewportProjection';
import { Events, MetadataModules } from '../src/enums';
import * as metaData from '../src/metaData';
import { isInAcquisitionPlane } from '../src/utilities/isInAcquisitionPlane';
import { getViewportContentMode } from '../src/utilities/viewportCapabilities';
import {
  COLUMNS,
  HEIGHT,
  IMAGE_ID,
  ROWS,
  WIDTH,
  createClient,
  mountLegacy,
  mountNext,
  remountNext,
  unmount,
} from './utils/wsiStandIn';

function expectClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

/**
 * Moves the picture of a next viewport by a delta in canvas pixels on the
 * screen, through the projection service.
 */
function panByCanvasDelta(viewport, delta) {
  const { pan, zoom } = viewportProjection.getPresentation(viewport, {
    selector: { zoom: true, pan: true },
  });

  viewport.setViewState(
    viewportProjection.withPresentation(viewport, {
      pan: [pan[0] + delta[0] / zoom, pan[1] + delta[1] / zoom],
    })
  );
}

const mounted = [];

async function track(promise) {
  const made = await promise;

  mounted.push(made);

  return made;
}

afterEach(() => {
  mounted.splice(0).forEach(unmount);
});

describe('Whole slide stand-in', () => {
  it('shows the same slide points on a legacy and a next viewport at one map zoom', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    legacy.view.setResolution(next.view.getResolution());
    [
      [0, 0],
      [WIDTH / 2, HEIGHT / 2],
      [WIDTH - 17, 233],
    ].forEach((canvasPoint) =>
      expectClose(
        next.viewport.canvasToWorld(canvasPoint),
        legacy.viewport.canvasToWorld(canvasPoint)
      )
    );
  });
});

describe('Pan on the direct next whole slide viewport', () => {
  /** The zoom and the pan of a viewport from the projection service. */
  function zoomPanOf(viewport) {
    return viewportProjection.getPresentation(viewport, {
      selector: { zoom: true, pan: true },
    });
  }

  /** Applies a presentation patch through the projection service. */
  function present(viewport, presentation) {
    viewport.setViewState(
      viewportProjection.withPresentation(viewport, presentation)
    );
  }

  it('has no getPan and no setPan, which the adapter keeps', async () => {
    const next = await track(mountNext(WSIViewport, 0.4));
    const adapter = await track(mountNext(WSIViewportLegacyAdapter, 0.4));

    expect(next.viewport.getPan).toBeUndefined();
    expect(next.viewport.setPan).toBeUndefined();
    expect(adapter.viewport.getPan()).toEqual([0, 0]);
    expect(typeof adapter.viewport.setPan).toBe('function');
  });

  it('gives pan [0, 0] in the projection service when the centre of the slide is at the centre of the canvas, with no state of its own', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));
    const atMount = zoomPanOf(viewport).pan;

    view.setCenter([COLUMNS / 2, -ROWS / 2]);

    expectClose(zoomPanOf(viewport).pan, [0, 0]);
    expect(Math.hypot(...atMount)).toBeGreaterThan(1);
    expect('panOrigin' in viewport).toBe(false);

    view.setCenter([COLUMNS / 2 - 80 * view.getResolution(), -ROWS / 2]);

    expect(Math.hypot(...zoomPanOf(viewport).pan)).toBeCloseTo(
      80 / view.getZoom(),
      6
    );
  });

  it('moves the picture by a pan of the projection service times the zoom, as the adapter does with setPan', async () => {
    const next = await track(mountNext(WSIViewport, 0.4));
    const adapter = await track(mountNext(WSIViewportLegacyAdapter, 0.4));
    const focalPoint = next.viewport.canvasToWorld([WIDTH / 2, HEIGHT / 2]);
    const { pan, zoom } = zoomPanOf(next.viewport);

    present(next.viewport, { pan: [pan[0] + 40 / zoom, pan[1] - 20 / zoom] });
    adapter.viewport.setPan([40, -20]);

    expectClose(next.viewport.worldToCanvas(focalPoint), [
      WIDTH / 2 + 40,
      HEIGHT / 2 - 20,
    ]);
    expectClose(next.view.getCenter(), adapter.view.getCenter());
    expectClose(zoomPanOf(next.viewport).pan, [
      pan[0] + 40 / zoom,
      pan[1] - 20 / zoom,
    ]);
  });

  it('reads the pan in the presentation and sets it again', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));
    const atMount = zoomPanOf(viewport);

    present(viewport, {
      pan: [
        atMount.pan[0] + 40 / atMount.zoom,
        atMount.pan[1] - 20 / atMount.zoom,
      ],
    });

    const presentation = viewportProjection.getPresentation(viewport);
    const center = view.getCenter();

    expectClose(presentation.pan, [
      atMount.pan[0] + 40 / view.getZoom(),
      atMount.pan[1] - 20 / view.getZoom(),
    ]);

    present(viewport, { pan: [atMount.pan[0] - 7, atMount.pan[1] + 3] });

    expect(view.getCenter()).not.toEqual(center);

    present(viewport, presentation);

    expectClose(zoomPanOf(viewport).pan, presentation.pan);
    expectClose(view.getCenter(), center);
  });

  it('sets a pan and a zoom of a presentation together', async () => {
    const source = await track(mountNext(WSIViewport, 0.4));
    const target = await track(mountNext(WSIViewport, 0.4));
    const { pan } = zoomPanOf(source.viewport);

    source.viewport.setZoom(source.viewport.getZoom() + 1, [50, 60]);
    present(source.viewport, { pan: [pan[0] + 5, pan[1] + 7] });

    present(
      target.viewport,
      viewportProjection.getPresentation(source.viewport)
    );

    expect(target.view.getZoom()).toBeCloseTo(source.view.getZoom(), 9);
    expectClose(zoomPanOf(target.viewport).pan, zoomPanOf(source.viewport).pan);
    expectClose(target.view.getCenter(), source.view.getCenter());
  });
});

describe('Rotation of the direct next whole slide viewport', () => {
  it('takes the rotation of the view state in degrees, as a planar viewport', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));

    viewport.setViewState({ rotation: 90 });

    expect(view.getRotation()).toBeCloseTo(0.4 + Math.PI / 2, 12);
    expect(viewport.getViewState().rotation).toBeCloseTo(90, 9);
    expect(viewport.getRotation()).toBeCloseTo(90, 9);
    expect(viewportProjection.getPresentation(viewport).rotation).toBeCloseTo(
      90,
      9
    );
  });

  it('gives the rotation of the map less the slide rotation in degrees', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    expect(next.viewport.getRotation()).toBe(legacy.viewport.getRotation());

    next.view.setRotation(0.4 + Math.PI / 6);

    expect(next.viewport.getRotation()).toBeCloseTo(30, 9);
    expect(next.viewport.getViewState().rotation).toBeCloseTo(30, 9);
  });

  it('turns by the angle in degrees that the rotate tool sends', async () => {
    const { viewport, view } = await track(mountNext(WSIViewport, 0.4));
    const center = view.getCenter();
    const turn = (angle) => {
      const { rotation = 0 } = viewportProjection.getPresentation(viewport);

      viewport.setViewState(
        viewportProjection.withPresentation(viewport, {
          rotation: (rotation + angle + 360) % 360,
        })
      );
    };

    turn(30);
    turn(15);

    expect(view.getRotation()).toBeCloseTo(0.4 + Math.PI / 4, 12);
    expect(viewport.getRotation()).toBeCloseTo(45, 9);
    expectClose(view.getCenter(), center);

    viewport.resetViewState();

    expect(view.getRotation()).toBeCloseTo(0.4, 12);
    expect(viewport.getRotation()).toBeCloseTo(0, 9);
  });
});

describe('Annotations saved on a legacy whole slide viewport', () => {
  /**
   * The references that the tools store for a probe and for a rectangle on
   * the legacy viewport: the view reference with the points of the
   * annotation, and the image id the tools add.
   */
  function legacyReferences(legacyViewport) {
    const probe = legacyViewport.canvasToWorld([120, 80]);
    const corners = [
      legacyViewport.canvasToWorld([60, 40]),
      legacyViewport.canvasToWorld([180, 140]),
    ];

    return [
      legacyViewport.getViewReference(),
      legacyViewport.getViewReference({ points: [probe] }),
      {
        ...legacyViewport.getViewReference({ points: corners }),
        referencedImageId: legacyViewport.getCurrentImageId(),
      },
    ];
  }

  it('shows them on the next viewport, as the legacy viewport does', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    legacyReferences(legacy.viewport).forEach((reference) => {
      expect(reference.viewPlaneNormal).toEqual([0, 0, 1]);
      expect(reference.planeRestriction).toBeDefined();
      expect(legacy.viewport.isReferenceViewable(reference)).toBe(true);
      expect(next.viewport.isReferenceViewable(reference)).toBe(true);
    });
  });

  it('keeps showing them after a pan, a zoom and a rotation', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    panByCanvasDelta(next.viewport, [80, -40]);
    next.viewport.setZoom(next.viewport.getZoom() + 2, [30, 50]);
    next.viewport.setViewState({ rotation: 70 });

    legacyReferences(legacy.viewport).forEach((reference) =>
      expect(next.viewport.isReferenceViewable(reference)).toBe(true)
    );
  });

  it('rejects them on another frame of reference or another slide plane', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));
    const [reference] = legacyReferences(legacy.viewport);
    const otherFrame = {
      ...reference,
      FrameOfReferenceUID: '9.9.9',
      planeRestriction: {
        ...reference.planeRestriction,
        FrameOfReferenceUID: '9.9.9',
      },
    };
    const point = reference.planeRestriction.point;
    const otherPlane = {
      ...reference,
      planeRestriction: {
        ...reference.planeRestriction,
        point: [point[0], point[1], point[2] + 5],
      },
    };

    [otherFrame, otherPlane].forEach((ref) => {
      expect(legacy.viewport.isReferenceViewable(ref)).toBe(false);
      expect(next.viewport.isReferenceViewable(ref)).toBe(false);
    });
  });
});

describe('Events of the direct next whole slide viewport', () => {
  it('fires CAMERA_RESET once on resetViewState, as the next video and ECG viewports do', async () => {
    const { viewport, element } = await track(mountNext(WSIViewport, 0.4));
    const resets = [];

    element.addEventListener(Events.CAMERA_RESET, (evt) =>
      resets.push(evt.detail)
    );
    viewport.setViewState({ rotation: 20 });

    expect(viewport.resetViewState()).toBe(true);
    expect(resets.length).toBe(1);
    expect(resets[0].viewportId).toBe(viewport.id);
    expect(resets[0].camera.rotation).toBeCloseTo(0, 9);
  });
});

describe('Small members of the direct next whole slide viewport', () => {
  it('says wholeSlide as its content mode, the mode that getViewportContentMode gives for the legacy viewport, and empty with nothing mounted', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));
    const empty = new WSIViewport({
      id: 'wsiEmpty',
      element: document.createElement('div'),
      renderingEngineId: 'renderingEngine',
    });

    expect(next.viewport.getCurrentMode()).toBe('wholeSlide');
    expect(getViewportContentMode(next.viewport)).toBe(
      getViewportContentMode(legacy.viewport)
    );
    expect(isInAcquisitionPlane(next.viewport)).toBe(true);
    expect(empty.getCurrentMode()).toBe('empty');
  });

  it('gives the calibration that the legacy viewport gives in the image data', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    expect(next.viewport.getImageData().calibration).toEqual(
      legacy.viewport.getImageData().calibration
    );
  });

  it('takes the web client of the WADO_WEB_CLIENT metadata, as the legacy viewport does', async () => {
    const webClient = createClient();
    const provider = (type, imageId) =>
      type === MetadataModules.WADO_WEB_CLIENT && imageId === IMAGE_ID
        ? webClient
        : undefined;

    metaData.addProvider(provider, 100000);

    try {
      const legacy = await track(mountLegacy(0.4, { withDataIds: true }));
      const next = await track(
        mountNext(WSIViewport, 0.4, { withWebClient: false })
      );

      expect(next.viewport.getCurrentImageId()).toBe(IMAGE_ID);
      expect(next.viewport.getFrameOfReferenceUID()).toBe(
        legacy.viewport.getFrameOfReferenceUID()
      );
    } finally {
      metaData.removeProvider(provider);
    }
  });

  it('has a canvas with the size of the viewport, as the legacy viewport has, and no getCanvas', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(
      mountNext(WSIViewport, 0.4, { withCanvas: false })
    );
    const { canvas } = next.viewport;

    expect(legacy.viewport.getCanvas()).toBe(legacy.viewport.canvas);
    expect(next.viewport.getCanvas).toBeUndefined();
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(next.element.contains(canvas)).toBe(true);
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  it('keeps getCanvas on the legacy adapter, as on the legacy viewport', async () => {
    const adapter = await track(
      mountNext(WSIViewportLegacyAdapter, 0.4, { withCanvas: false })
    );

    expect(adapter.viewport.getCanvas()).toBe(adapter.viewport.canvas);
    expect(adapter.element.contains(adapter.viewport.canvas)).toBe(true);
  });
});

describe('Zoom at mount of the direct next whole slide viewport', () => {
  it('keeps the view that the microscopy viewer fits to the canvas, as the legacy viewport does', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));

    expect(next.view.getResolution()).toBeCloseTo(
      legacy.view.getResolution(),
      12
    );
    expectClose(next.view.getCenter(), legacy.view.getCenter());
    expect(next.viewport.getZoom()).toBeCloseTo(legacy.viewport.getZoom(), 12);
    [
      [0, 0],
      [WIDTH, HEIGHT],
    ].forEach((canvasPoint) =>
      expectClose(
        next.viewport.canvasToWorld(canvasPoint),
        legacy.viewport.canvasToWorld(canvasPoint)
      )
    );
  });

  it('fits a slide mounted again, as the legacy viewport fits each slide', async () => {
    const next = await track(mountNext(WSIViewport, 0.4));
    const fitResolution = next.view.getResolution();
    const fitPan = viewportProjection.getPresentation(next.viewport).pan;

    next.viewport.setZoom(next.viewport.getZoom() + 2, [30, 40]);
    panByCanvasDelta(next.viewport, [25, 10]);
    const view = await remountNext(next.viewport, 0.4);

    expect(view).not.toBe(next.view);
    expect(view.getResolution()).toBeCloseTo(fitResolution, 12);
    expectClose(viewportProjection.getPresentation(next.viewport).pan, fitPan);
  });
});

describe('Scroll of the direct next whole slide viewport', () => {
  it('zooms by the factor of the legacy viewport for one step', async () => {
    const legacy = await track(mountLegacy(0.4));
    const next = await track(mountNext(WSIViewport, 0.4));
    const legacyCenter = legacy.view.getCenter();
    const nextCenter = next.view.getCenter();

    legacy.viewport.scroll(1);
    next.viewport.scroll(1);

    expect(legacy.view.getResolution()).toBeCloseTo(4.4, 6);
    expect(next.view.getResolution()).toBeCloseTo(
      legacy.view.getResolution(),
      6
    );
    expectClose(legacy.view.getCenter(), legacyCenter);
    expectClose(next.view.getCenter(), nextCenter);
  });

  it('zooms in for a step back and keeps the zoom of the map in step', async () => {
    const legacy = await track(mountLegacy(0));
    const next = await track(mountNext(WSIViewport, 0));

    legacy.viewport.scroll(-2);
    next.viewport.scroll(-2);

    expect(next.view.getResolution()).toBeCloseTo(
      legacy.view.getResolution(),
      6
    );
    expect(next.viewport.getZoom()).toBeCloseTo(legacy.viewport.getZoom(), 6);
  });
});

describe('suppressEvents on the direct next whole slide viewport', () => {
  /** Counts the camera events of a viewport. */
  function countCameraEvents(viewport) {
    const counts = { modified: 0, reset: 0 };

    viewport.element.addEventListener(Events.CAMERA_MODIFIED, () => {
      counts.modified++;
    });
    viewport.element.addEventListener(Events.CAMERA_RESET, () => {
      counts.reset++;
    });

    return counts;
  }

  it('fires no CAMERA_MODIFIED with suppressEvents in the options, as the legacy viewport', async () => {
    const defaultOptions = { suppressEvents: true };
    const legacy = await track(mountLegacy(0, { defaultOptions }));
    const next = await track(mountNext(WSIViewport, 0, { defaultOptions }));
    const legacyCounts = countCameraEvents(legacy.viewport);
    const nextCounts = countCameraEvents(next.viewport);

    legacy.viewport.setCamera({
      parallelScale: legacy.viewport.getCamera().parallelScale / 2,
    });
    next.viewport.setZoom(2);
    panByCanvasDelta(next.viewport, [10, 10]);
    next.viewport.resetViewState();

    expect(next.viewport.defaultOptions.suppressEvents).toBe(true);
    expect('suppressEvents' in next.viewport).toBe(false);
    expect(legacyCounts.modified).toBe(0);
    expect(nextCounts).toEqual({ modified: 0, reset: 0 });
  });

  it('fires CAMERA_MODIFIED without suppressEvents, as the legacy viewport', async () => {
    const legacy = await track(mountLegacy(0));
    const next = await track(mountNext(WSIViewport, 0));
    const legacyCounts = countCameraEvents(legacy.viewport);
    const nextCounts = countCameraEvents(next.viewport);

    legacy.viewport.setCamera({
      parallelScale: legacy.viewport.getCamera().parallelScale / 2,
    });
    next.viewport.setZoom(2);

    expect(next.viewport.defaultOptions.suppressEvents).toBeUndefined();
    expect('suppressEvents' in next.viewport).toBe(false);
    expect(legacyCounts.modified).toBe(1);
    expect(nextCounts.modified).toBe(1);
  });
});
