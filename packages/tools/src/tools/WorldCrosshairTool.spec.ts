import { vec3 } from 'gl-matrix';
import { eventTarget } from '@cornerstonejs/core';
import WorldCrosshairTool from './WorldCrosshairTool';
import Events from '../enums/Events';

type Orientation = 'axial' | 'sagittal' | 'coronal';

const ORIENTATION_NORMALS: Record<Orientation, number[]> = {
  axial: [0, 0, 1],
  sagittal: [1, 0, 0],
  coronal: [0, 1, 0],
};

const ORIENTATION_VIEW_UPS: Record<Orientation, number[]> = {
  axial: [0, -1, 0],
  sagittal: [0, 0, 1],
  coronal: [0, 0, 1],
};

/**
 * Fake direct Generic planar ("next") viewport. It intentionally has NO
 * legacy setCamera: the tools must navigate exclusively through
 * setViewReference / setViewState, and any legacy camera write would throw.
 */
function createFakePlanarViewport({
  id,
  orientation = 'axial' as Orientation,
  focalPoint = [0, 0, 0],
  frameOfReferenceUID = 'FOR1',
}) {
  const normal = ORIENTATION_NORMALS[orientation];
  const camera = {
    viewPlaneNormal: [...normal],
    viewUp: [...ORIENTATION_VIEW_UPS[orientation]],
    focalPoint: [...focalPoint],
    position: focalPoint.map((v, i) => v + normal[i] * 100),
    parallelScale: 100,
  };

  const viewState: Record<string, unknown> = {};

  const syncPosition = () => {
    camera.position = camera.focalPoint.map(
      (v, i) => v + camera.viewPlaneNormal[i] * 100
    );
  };

  const viewport = {
    id,
    type: 'planarNext',
    renderingEngineId: 'fakeRenderingEngine',
    canvas: { clientWidth: 0, clientHeight: 0 },
    // Generic viewports render to the element's displayed space; geometry
    // helpers read the element size, not the hidden canvas size.
    element: { clientWidth: 500, clientHeight: 500 },
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    // --- Generic ("next") surface (isGenericViewport duck-typing) ---
    setDisplaySets: async () => undefined,
    setDisplaySetPresentation: jest.fn(),
    getDisplaySetPresentation: () => undefined,
    setViewState: jest.fn((patch: Record<string, unknown>) => {
      Object.assign(viewState, patch);
    }),
    getViewState: () => ({ ...viewState }),
    getCurrentMode: () => 'volume',
    getViewReference: () => ({
      cameraFocalPoint: [...camera.focalPoint],
      viewPlaneNormal: [...camera.viewPlaneNormal],
      viewUp: [...camera.viewUp],
    }),
    setViewReference: jest.fn(
      (viewRef: {
        cameraFocalPoint?: number[];
        viewPlaneNormal?: number[];
        viewUp?: number[];
      }) => {
        if (viewRef.viewPlaneNormal) {
          camera.viewPlaneNormal = [...viewRef.viewPlaneNormal];
          if (viewRef.viewUp) {
            camera.viewUp = [...viewRef.viewUp];
          }
          if (viewRef.cameraFocalPoint) {
            // Reorientation writes place the plane through the given point.
            camera.focalPoint = [...viewRef.cameraFocalPoint];
          }
          syncPosition();
          return;
        }

        if (viewRef.cameraFocalPoint) {
          // Slice navigation only: move along the current normal (never an
          // in-plane pan), like the planar view-reference controller.
          const delta = vec3.subtract(
            vec3.create(),
            viewRef.cameraFocalPoint as never,
            camera.focalPoint as never
          );
          const distance = vec3.dot(delta, camera.viewPlaneNormal as never);
          camera.focalPoint = camera.focalPoint.map(
            (v, i) => v + camera.viewPlaneNormal[i] * distance
          );
          syncPosition();
        }
      }
    ),
    getResolvedView: () => ({
      toICamera: () => ({
        viewPlaneNormal: [...camera.viewPlaneNormal],
        viewUp: [...camera.viewUp],
        focalPoint: [...camera.focalPoint],
        position: [...camera.position],
        parallelScale: camera.parallelScale,
      }),
    }),
    render: jest.fn(),
    worldToCanvas: () => [250, 250],
    canvasToWorld: () => [...camera.focalPoint],
    getCamera: () => ({
      viewPlaneNormal: [...camera.viewPlaneNormal],
      viewUp: [...camera.viewUp],
      focalPoint: [...camera.focalPoint],
      position: [...camera.position],
      parallelScale: camera.parallelScale,
    }),
    _camera: camera,
    _viewState: viewState,
  };

  return viewport;
}

/** Legacy viewport stand-in: the tools must ignore it entirely. */
function createFakeLegacyViewport({ id, focalPoint = [0, 0, 0] }) {
  const camera = {
    viewPlaneNormal: [0, 0, 1],
    viewUp: [0, -1, 0],
    focalPoint: [...focalPoint],
    position: [focalPoint[0], focalPoint[1], focalPoint[2] + 100],
  };

  return {
    id,
    type: 'orthographic',
    renderingEngineId: 'fakeRenderingEngine',
    canvas: { clientWidth: 500, clientHeight: 500 },
    getFrameOfReferenceUID: () => 'FOR1',
    getViewReference: () => undefined,
    getCamera: () => ({ ...camera }),
    setCamera: jest.fn(),
    setViewReference: jest.fn(),
    render: jest.fn(),
    worldToCanvas: () => [250, 250],
    canvasToWorld: () => [...camera.focalPoint],
    _camera: camera,
  };
}

function createTool({
  viewports = [],
  configuration = {},
}: {
  viewports?: unknown[];
  configuration?: Record<string, unknown>;
} = {}) {
  const tool = new WorldCrosshairTool({ configuration });
  tool.toolGroupId = 'testToolGroup';

  // Stub the viewport resolution and render fan-out: unit tests run without
  // rendering engines or tool groups. The stub deliberately returns the
  // viewports unfiltered so the tool's own planar-generic gates are what get
  // exercised.
  (tool as unknown as Record<string, unknown>)._getLinkedViewports = () =>
    viewports;
  (tool as unknown as Record<string, unknown>)._renderLinkedViewports = () =>
    undefined;

  return tool;
}

describe('WorldCrosshairTool', () => {
  const listeners: Array<[string, EventListener]> = [];

  function addListener(eventName: string, callback: EventListener) {
    eventTarget.addEventListener(eventName, callback);
    listeners.push([eventName, callback]);
  }

  afterEach(() => {
    while (listeners.length) {
      const [eventName, callback] = listeners.pop();
      eventTarget.removeEventListener(eventName, callback);
    }
  });

  it('has the expected static tool name and label', () => {
    expect(WorldCrosshairTool.toolName).toBe('WorldCrosshair');
    expect(WorldCrosshairTool.toolLabel).toBe('Reference Point');
  });

  it('setWorldPoint stores the exact world point (as a copy)', () => {
    const tool = createTool({ configuration: { jumpOnSet: false } });

    const point: [number, number, number] = [12.5, -3.25, 40.125];
    tool.setWorldPoint(point);

    expect(tool.getWorldPoint()).toEqual([12.5, -3.25, 40.125]);

    // Mutating the input or the returned point never changes the state.
    point[0] = 999;
    tool.getWorldPoint()[1] = 999;
    expect(tool.getWorldPoint()).toEqual([12.5, -3.25, 40.125]);
  });

  it('does not react to CAMERA_MODIFIED and camera changes never move the point', () => {
    const viewport = createFakePlanarViewport({ id: 'vp1' });
    const tool = createTool({
      viewports: [viewport],
      configuration: { jumpOnSet: false },
    });

    tool.setWorldPoint([1, 2, 3]);

    // The tool intentionally has no camera-modified hook: the point cannot
    // be recomputed from cameras.
    expect(
      (tool as unknown as Record<string, unknown>).onCameraModified
    ).toBeUndefined();
    expect(
      (tool as unknown as Record<string, unknown>).onResetCamera
    ).toBeUndefined();

    // Scroll (translate along normal), pan (in-plane translate) and zoom.
    viewport._camera.focalPoint = [1, 2, 50];
    viewport._camera.position = [1, 2, 150];
    viewport._camera.focalPoint = [30, -10, 50];
    viewport._camera.position = [30, -10, 150];
    viewport._camera.parallelScale = 12;

    expect(tool.getWorldPoint()).toEqual([1, 2, 3]);
  });

  it('clearWorldPoint sets the point to null and emits WORLD_CROSSHAIR_POINT_CLEARED', () => {
    const tool = createTool({ configuration: { jumpOnSet: false } });
    const clearedListener = jest.fn();
    addListener(Events.WORLD_CROSSHAIR_POINT_CLEARED, clearedListener);

    tool.setWorldPoint([1, 2, 3]);
    tool.clearWorldPoint();

    expect(tool.getWorldPoint()).toBeNull();
    expect(clearedListener).toHaveBeenCalledTimes(1);

    // Clearing again is a no-op and does not re-emit.
    tool.clearWorldPoint();
    expect(clearedListener).toHaveBeenCalledTimes(1);

    // clearWorldCrosshair is the documented clear command alias.
    tool.setWorldPoint([4, 5, 6]);
    tool.clearWorldCrosshair();
    expect(tool.getWorldPoint()).toBeNull();
  });

  it('emits WORLD_CROSSHAIR_POINT_CHANGED only when the point changes', () => {
    const tool = createTool({ configuration: { jumpOnSet: false } });
    const changedListener = jest.fn();
    addListener(Events.WORLD_CROSSHAIR_POINT_CHANGED, changedListener);

    tool.setWorldPoint([1, 2, 3]);
    tool.setWorldPoint([1, 2, 3]);
    tool.setWorldPoint([1, 2, 3.00000001]);

    expect(changedListener).toHaveBeenCalledTimes(1);

    tool.setWorldPoint([1, 2, 10]);
    expect(changedListener).toHaveBeenCalledTimes(2);

    const { detail } = changedListener.mock.calls[1][0] as CustomEvent;
    expect(detail.toolGroupId).toBe('testToolGroup');
    expect(detail.worldPoint).toEqual([1, 2, 10]);

    // suppressEvents silences the event but still stores the point.
    tool.setWorldPoint([5, 5, 5], { suppressEvents: true });
    expect(changedListener).toHaveBeenCalledTimes(2);
    expect(tool.getWorldPoint()).toEqual([5, 5, 5]);
  });

  it('jumpLinkedViewportsToWorldPoint navigates linked planar viewports along their own normals via setViewReference', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 5],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [5, 0, 0],
    });
    const tool = createTool({
      viewports: [axial, sagittal],
      configuration: { jumpOnSet: false },
    });
    const jumpedListener = jest.fn();
    addListener(Events.WORLD_CROSSHAIR_JUMPED_TO_POINT, jumpedListener);

    tool.setWorldPoint([10, 20, 30]);
    tool.jumpLinkedViewportsToWorldPoint();

    // Navigation went through the native view reference API.
    expect(axial.setViewReference).toHaveBeenCalled();
    expect(sagittal.setViewReference).toHaveBeenCalled();

    // Axial moved only along z (its normal): slice passes through z=30.
    expect(axial._camera.focalPoint).toEqual([0, 0, 30]);
    expect(axial._camera.position).toEqual([0, 0, 130]);

    // Sagittal moved only along x (its normal): slice passes through x=10.
    expect(sagittal._camera.focalPoint).toEqual([10, 0, 0]);
    expect(sagittal._camera.position).toEqual([110, 0, 0]);

    expect(jumpedListener).toHaveBeenCalledTimes(1);

    // The stored point is untouched by jumping.
    expect(tool.getWorldPoint()).toEqual([10, 20, 30]);
  });

  it('jump preserves pan and zoom in sliceOnly mode', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      // Panned viewport: focal point off the point in-plane.
      focalPoint: [-25, 40, 5],
    });
    const tool = createTool({
      viewports: [axial],
      configuration: { jumpOnSet: false },
    });

    tool.setWorldPoint([10, 20, 30]);
    tool.jumpLinkedViewportsToWorldPoint();

    // In-plane (pan) components preserved, only the normal component moved.
    expect(axial._camera.focalPoint).toEqual([-25, 40, 30]);
    // Zoom untouched and no pan anchor written.
    expect(axial._camera.parallelScale).toBe(100);
    expect(axial.setViewState).not.toHaveBeenCalled();
  });

  it('centered jump mode also anchors the point to the canvas center', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [-25, 40, 5],
    });
    const tool = createTool({
      viewports: [axial],
      configuration: { jumpOnSet: false },
    });

    tool.setWorldPoint([10, 20, 30]);
    tool.jumpLinkedViewportsToWorldPoint({ jumpMode: 'centered' });

    // Slice navigated through the point along the normal.
    expect(axial._camera.focalPoint).toEqual([-25, 40, 30]);
    // The point is pinned to the canvas center through the view state.
    expect(axial._viewState.anchorWorld).toEqual([10, 20, 30]);
    expect(axial._viewState.anchorCanvas).toEqual([0.5, 0.5]);
    // Zoom untouched.
    expect(axial._camera.parallelScale).toBe(100);
  });

  it('jumpOnSet jumps linked viewports when the point is set', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 5],
    });
    const tool = createTool({ viewports: [axial] });

    tool.setWorldPoint([1, 2, 42]);
    expect(axial._camera.focalPoint).toEqual([0, 0, 42]);
  });

  it('ignores legacy (non-generic) viewports entirely', () => {
    const legacy = createFakeLegacyViewport({
      id: 'legacy',
      focalPoint: [0, 0, 5],
    });
    const planar = createFakePlanarViewport({
      id: 'planar',
      orientation: 'axial',
      focalPoint: [0, 0, 5],
    });
    const tool = createTool({ viewports: [legacy, planar] });

    tool.setWorldPoint([1, 2, 42]);
    tool.jumpLinkedViewportsToWorldPoint();

    // The planar viewport navigated; the legacy viewport was never touched.
    expect(planar._camera.focalPoint).toEqual([0, 0, 42]);
    expect(legacy.setCamera).not.toHaveBeenCalled();
    expect(legacy.setViewReference).not.toHaveBeenCalled();
    expect(legacy._camera.focalPoint).toEqual([0, 0, 5]);
  });

  it('works with a single viewport', () => {
    const only = createFakePlanarViewport({
      id: 'only',
      orientation: 'coronal',
      focalPoint: [0, 5, 0],
    });
    const tool = createTool({ viewports: [only] });

    expect(() => {
      tool.setWorldPoint([3, 33, 7]);
      tool.jumpLinkedViewportsToWorldPoint();
    }).not.toThrow();

    expect(tool.getWorldPoint()).toEqual([3, 33, 7]);
    expect(only._camera.focalPoint).toEqual([0, 33, 0]);
  });

  it('never draws slice intersection lines and owns no slab or rotation behavior', () => {
    const tool = createTool({});

    // The state model deliberately has no line, slab or rotation concepts.
    expect(
      (tool as unknown as Record<string, unknown>).toolCenter
    ).toBeUndefined();
    expect(
      (tool as unknown as Record<string, unknown>).setSlabThickness
    ).toBeUndefined();

    const state = tool.getState();
    expect(state).toEqual({
      toolGroupId: 'testToolGroup',
      worldPoint: null,
      sourceViewportId: undefined,
      sourceRenderingEngineId: undefined,
      frameOfReferenceUID: undefined,
      visible: true,
      locked: false,
      cursorWorldPoint: null,
    });
  });
});
