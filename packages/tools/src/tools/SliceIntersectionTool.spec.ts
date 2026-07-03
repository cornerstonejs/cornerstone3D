import { vec3 } from 'gl-matrix';
import SliceIntersectionTool from './SliceIntersectionTool';
import WorldCrosshairTool from './WorldCrosshairTool';
import { distancePointToPlane } from '../utilities/spatial';
import type { Plane } from '../utilities/spatial';

type Orientation = 'axial' | 'sagittal' | 'coronal';

const ORIENTATION_AXES: Record<
  Orientation,
  { normal: number[]; u: number[]; v: number[] }
> = {
  // u/v are the in-plane axes the fake canvas maps to.
  axial: { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  sagittal: { normal: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  coronal: { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
};

const CANVAS_SIZE = 500;
const HALF = CANVAS_SIZE / 2;

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Fake direct Generic planar ("next") viewport. It intentionally has NO
 * legacy setCamera / setSlabThickness: manipulation must go through
 * setViewReference (navigation, reorientation) and setDisplaySetPresentation
 * (slab thickness).
 */
function createFakePlanarViewport({
  id,
  orientation = 'axial' as Orientation,
  focalPoint = [0, 0, 0],
  frameOfReferenceUID = 'FOR1',
  contentMode = 'volume' as 'volume' | 'stack',
  slabThickness = undefined as number | undefined,
}) {
  const axes = ORIENTATION_AXES[orientation];
  const camera = {
    viewPlaneNormal: [...axes.normal],
    viewUp: [...axes.v],
    focalPoint: [...focalPoint],
    position: focalPoint.map((v, i) => v + axes.normal[i] * 100),
    parallelScale: 100,
  };

  const dataId = `${id}-data`;
  const presentation: { slabThickness?: number; blendMode?: unknown } = {
    slabThickness,
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
    element: { clientWidth: CANVAS_SIZE, clientHeight: CANVAS_SIZE },
    getFrameOfReferenceUID: () => frameOfReferenceUID,
    // --- Generic ("next") surface (isGenericViewport duck-typing) ---
    setDisplaySets: async () => undefined,
    setDisplaySetPresentation: jest.fn(
      (dataIdArg: string, props: Record<string, unknown>) => {
        Object.assign(presentation, props);
      }
    ),
    getDisplaySetPresentation: () => ({ ...presentation }),
    getSourceDataId: () => dataId,
    getDefaultVOIRange: () => undefined,
    setViewState: jest.fn((patch: Record<string, unknown>) => {
      Object.assign(viewState, patch);
    }),
    getViewState: () => ({ ...viewState }),
    getCurrentMode: () => contentMode,
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
            camera.focalPoint = [...viewRef.cameraFocalPoint];
          }
          syncPosition();
          return;
        }

        if (viewRef.cameraFocalPoint) {
          // Slice navigation only: move along the current normal.
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
    worldToCanvas: (world: number[]) => {
      const rel = [
        world[0] - camera.focalPoint[0],
        world[1] - camera.focalPoint[1],
        world[2] - camera.focalPoint[2],
      ];
      // Note: the u/v axes are fixed per fake; tests that reorient a
      // viewport do not rely on its canvas mapping afterwards.
      const axesNow = axes;
      return [dot(rel, axesNow.u) + HALF, dot(rel, axesNow.v) + HALF];
    },
    canvasToWorld: (canvasPos: number[]) => {
      const du = canvasPos[0] - HALF;
      const dv = canvasPos[1] - HALF;
      return [
        camera.focalPoint[0] + axes.u[0] * du + axes.v[0] * dv,
        camera.focalPoint[1] + axes.u[1] * du + axes.v[1] * dv,
        camera.focalPoint[2] + axes.u[2] * du + axes.v[2] * dv,
      ];
    },
    _camera: camera,
    _presentation: presentation,
    _viewState: viewState,
    _dataId: dataId,
  };

  return viewport;
}

/** Legacy viewport stand-in: the tool must ignore it entirely. */
function createFakeLegacyViewport({ id, orientation = 'axial' as Orientation }) {
  const axes = ORIENTATION_AXES[orientation];
  const camera = {
    viewPlaneNormal: [...axes.normal],
    viewUp: [...axes.v],
    focalPoint: [0, 0, 0],
    position: axes.normal.map((v) => v * 100),
  };

  return {
    id,
    type: 'orthographic',
    renderingEngineId: 'fakeRenderingEngine',
    canvas: { clientWidth: CANVAS_SIZE, clientHeight: CANVAS_SIZE },
    getFrameOfReferenceUID: () => 'FOR1',
    getViewReference: () => undefined,
    getCamera: () => ({ ...camera }),
    setCamera: jest.fn(),
    render: jest.fn(),
    worldToCanvas: () => [HALF, HALF],
    canvasToWorld: () => [...camera.focalPoint],
    _camera: camera,
  };
}

function getPlane(viewport: {
  getCamera: () => { viewPlaneNormal: number[]; focalPoint: number[] };
}): Plane {
  const camera = viewport.getCamera?.() ?? {
    viewPlaneNormal: viewport['_camera'].viewPlaneNormal,
    focalPoint: viewport['_camera'].focalPoint,
  };
  return {
    normal: [...camera.viewPlaneNormal] as Plane['normal'],
    point: [...camera.focalPoint] as Plane['point'],
  };
}

function planeOfFake(viewport: { _camera }): Plane {
  return {
    normal: [...viewport._camera.viewPlaneNormal] as Plane['normal'],
    point: [...viewport._camera.focalPoint] as Plane['point'],
  };
}

function createTool({
  viewports = [] as unknown[],
  configuration = {} as Record<string, unknown>,
} = {}) {
  const tool = new SliceIntersectionTool({ configuration });
  tool.toolGroupId = 'testToolGroup';

  // Stub the viewport resolution and render fan-out: unit tests run without
  // rendering engines or tool groups. The stub deliberately returns the
  // viewports unfiltered so the tool's own planar-generic gates are what get
  // exercised.
  (tool as unknown as Record<string, unknown>)._getToolGroupViewports = () =>
    viewports;
  (tool as unknown as Record<string, unknown>)._renderToolViewports = () =>
    undefined;

  return tool;
}

function computeLines(
  tool: SliceIntersectionTool,
  targetViewport: unknown
) {
  return (
    tool as unknown as {
      _computeLinesForTarget: (viewport) => Array<{
        sourceViewportId: string;
        targetViewportId: string;
        canvasPoints: [number[], number[]];
      }>;
    }
  )._computeLinesForTarget(targetViewport);
}

describe('SliceIntersectionTool', () => {
  it('has the expected static tool name and label', () => {
    expect(SliceIntersectionTool.toolName).toBe('SliceIntersection');
    expect(SliceIntersectionTool.toolLabel).toBe('Slice Intersections');
  });

  it('renders no line with only one viewport', () => {
    const only = createFakePlanarViewport({ id: 'only' });
    const tool = createTool({
      viewports: [only],
      configuration: { sourcePolicy: 'allLinked' },
    });

    expect(computeLines(tool, only)).toEqual([]);
  });

  it('renders a line for two non-parallel linked slice planes, derived from the actual plane-plane intersection', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const tool = createTool({
      viewports: [axial, sagittal],
      configuration: { sourcePolicy: 'allLinked' },
    });

    const lines = computeLines(tool, axial);
    expect(lines).toHaveLength(1);

    const [line] = lines;
    expect(line.sourceViewportId).toBe('sagittal');
    expect(line.targetViewportId).toBe('axial');

    // Every rendered point, mapped back to world, lies on BOTH planes: the
    // line is the true plane-plane intersection (x=10 on the z=0 plane), not
    // a line centered on any stored point.
    const axialPlane = planeOfFake(axial);
    const sagittalPlane = planeOfFake(sagittal);

    line.canvasPoints.forEach((canvasPoint) => {
      const world = axial.canvasToWorld(canvasPoint);
      expect(distancePointToPlane(world as never, axialPlane)).toBeCloseTo(0);
      expect(distancePointToPlane(world as never, sagittalPlane)).toBeCloseTo(
        0
      );
    });

    // And the line spans the canvas along the expected direction (x=10 maps
    // to canvas x = 260 for this fake viewport).
    expect(line.canvasPoints[0][0]).toBeCloseTo(260);
    expect(line.canvasPoints[1][0]).toBeCloseTo(260);
  });

  it('stores no persistent world point and has no legacy toolCenter', () => {
    const tool = createTool({});

    expect(
      (tool as unknown as Record<string, unknown>).toolCenter
    ).toBeUndefined();
    expect(
      (tool as unknown as Record<string, unknown>).worldPoint
    ).toBeUndefined();

    const state = tool.getState();
    expect(Object.keys(state).sort()).toEqual(
      [
        'activeOperation',
        'activeSourceViewportId',
        'activeTargetViewportId',
        'selectedSourceViewportIds',
        'sourcePolicy',
        'toolGroupId',
      ].sort()
    );
  });

  it('does not center lines on a WorldCrosshairTool point', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const tool = createTool({
      viewports: [axial, sagittal],
      configuration: { sourcePolicy: 'allLinked' },
    });

    const before = computeLines(tool, axial);

    // A WorldCrosshairTool with a wildly different point existing in the
    // page must not influence the intersection geometry.
    const worldCrosshair = new WorldCrosshairTool({
      configuration: { jumpOnSet: false },
    });
    worldCrosshair.toolGroupId = 'testToolGroup';
    (
      worldCrosshair as unknown as Record<string, unknown>
    )._renderLinkedViewports = () => undefined;
    (
      worldCrosshair as unknown as Record<string, unknown>
    )._getLinkedViewports = () => [];
    worldCrosshair.setWorldPoint([-500, 123, 987]);

    const after = computeLines(tool, axial);
    expect(after).toHaveLength(1);
    expect(after[0].canvasPoints).toEqual(before[0].canvasPoints);
  });

  it('hides same-orientation and parallel planes by default', () => {
    const axial1 = createFakePlanarViewport({
      id: 'axial1',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const axial2 = createFakePlanarViewport({
      id: 'axial2',
      orientation: 'axial',
      focalPoint: [0, 0, 25],
    });
    const tool = createTool({
      viewports: [axial1, axial2],
      configuration: { sourcePolicy: 'debugAll' },
    });

    // Parallel planes at different offsets: hidden.
    expect(computeLines(tool, axial1)).toEqual([]);
    // Same plane: hidden as well.
    axial2._camera.focalPoint = [0, 0, 0];
    expect(computeLines(tool, axial1)).toEqual([]);
  });

  it('activeViewport mode draws lines only from the active source viewport', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
    });
    const coronal = createFakePlanarViewport({
      id: 'coronal',
      orientation: 'coronal',
    });
    const tool = createTool({
      viewports: [axial, sagittal, coronal],
      configuration: { sourcePolicy: 'activeViewport' },
    });

    tool.setActiveSourceViewport('sagittal');

    expect(
      computeLines(tool, axial).map((line) => line.sourceViewportId)
    ).toEqual(['sagittal']);
    expect(
      computeLines(tool, coronal).map((line) => line.sourceViewportId)
    ).toEqual(['sagittal']);
    // The active source viewport itself shows no line (no self intersection).
    expect(computeLines(tool, sagittal)).toEqual([]);
  });

  it('mprTriad mode draws only the canonical MPR source lines', () => {
    const axial1 = createFakePlanarViewport({
      id: 'axial1',
      orientation: 'axial',
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
    });
    const coronal = createFakePlanarViewport({
      id: 'coronal',
      orientation: 'coronal',
    });
    // A duplicate/follower axial viewport: not canonical.
    const axial2 = createFakePlanarViewport({
      id: 'axial2',
      orientation: 'axial',
      focalPoint: [0, 0, 40],
    });
    const tool = createTool({
      viewports: [axial1, sagittal, coronal, axial2],
      configuration: { sourcePolicy: 'mprTriad' },
    });

    const sourceIds = computeLines(tool, sagittal)
      .map((line) => line.sourceViewportId)
      .sort();

    expect(sourceIds).toEqual(['axial1', 'coronal']);
  });

  it('selectedViewports mode draws only selected source viewport lines', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
    });
    const coronal = createFakePlanarViewport({
      id: 'coronal',
      orientation: 'coronal',
    });
    const tool = createTool({
      viewports: [axial, sagittal, coronal],
      configuration: {
        sourcePolicy: 'selectedViewports',
        selectedSourceViewportIds: ['coronal'],
      },
    });

    expect(
      computeLines(tool, axial).map((line) => line.sourceViewportId)
    ).toEqual(['coronal']);
    expect(
      computeLines(tool, sagittal).map((line) => line.sourceViewportId)
    ).toEqual(['coronal']);
  });

  it('suppresses lines between viewports that are not spatially linked', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      frameOfReferenceUID: 'FOR1',
    });
    const sagittalOtherFrame = createFakePlanarViewport({
      id: 'sagittalOtherFrame',
      orientation: 'sagittal',
      frameOfReferenceUID: 'FOR2',
    });
    const tool = createTool({
      viewports: [axial, sagittalOtherFrame],
      configuration: { sourcePolicy: 'debugAll' },
    });

    expect(computeLines(tool, axial)).toEqual([]);
  });

  it('dragging a line translates only the source viewport plane via setViewReference', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const tool = createTool({ viewports: [axial, sagittal] });

    const applyTranslate = (
      tool as unknown as {
        _applyTranslate: (viewport, evt) => void;
      }
    )._applyTranslate.bind(tool);

    // Drag delta [3, 4, 5]: only its projection on the sagittal normal
    // ([1, 0, 0]) scrolls the sagittal viewport.
    applyTranslate(sagittal, {
      detail: { deltaPoints: { world: [3, 4, 5] } },
    });

    expect(sagittal.setViewReference).toHaveBeenCalled();
    expect(sagittal._camera.focalPoint).toEqual([13, 0, 0]);
    expect(sagittal._camera.position).toEqual([113, 0, 0]);
    expect(sagittal.render).toHaveBeenCalled();

    // The unrelated (target) viewport camera is untouched.
    expect(axial.setViewReference).not.toHaveBeenCalled();
    expect(axial._camera.focalPoint).toEqual([0, 0, 0]);
    expect(axial._camera.position).toEqual([0, 0, 100]);
  });

  it('rotating reorients only the intended volume-backed source viewport plane', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [0, 0, 0],
    });
    const tool = createTool({ viewports: [axial, sagittal] });

    const applyRotate = (
      tool as unknown as {
        _applyRotate: (viewport, evt, editData) => void;
      }
    )._applyRotate.bind(tool);

    const editData = {
      targetViewportId: 'axial',
      sourceViewportId: 'sagittal',
      operation: 'rotate',
      pivotWorld: [0, 0, 0],
      rotationAxis: [0, 0, 1],
    };
    const rotateEvent = {
      detail: {
        currentPoints: { canvas: [HALF + 100, HALF + 100] },
        deltaPoints: { canvas: [0, 100] },
      },
    };

    const beforeNormal = [...sagittal._camera.viewPlaneNormal];

    applyRotate(sagittal, rotateEvent, editData);

    // The reorientation went through the native view reference API and the
    // sagittal normal rotated within the axial plane, around the pivot.
    expect(sagittal.setViewReference).toHaveBeenCalledWith(
      expect.objectContaining({
        viewPlaneNormal: expect.any(Array),
        viewUp: expect.any(Array),
        cameraFocalPoint: [0, 0, 0],
      })
    );
    expect(
      vec3.dot(sagittal._camera.viewPlaneNormal as never, beforeNormal as never)
    ).toBeLessThan(0.999);
    expect(vec3.length(sagittal._camera.viewPlaneNormal as never)).toBeCloseTo(
      1
    );

    // The target viewport is untouched.
    expect(axial._camera.viewPlaneNormal).toEqual([0, 0, 1]);
    expect(axial.setViewReference).not.toHaveBeenCalled();

    // Image-stack sources cannot be reoriented: the rotate is a no-op.
    const stack = createFakePlanarViewport({
      id: 'stack',
      orientation: 'sagittal',
      contentMode: 'stack',
    });
    applyRotate(stack, rotateEvent, { ...editData, sourceViewportId: 'stack' });
    expect(stack.setViewReference).not.toHaveBeenCalled();
  });

  it('slab handles modify only the source viewport slab thickness through the display-set presentation', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const tool = createTool({ viewports: [axial, sagittal] });

    const applySlabThickness = (
      tool as unknown as {
        _applySlabThickness: (viewport, evt) => void;
      }
    )._applySlabThickness.bind(tool);

    // Cursor 7mm from the sagittal plane -> slab thickness 14mm.
    applySlabThickness(sagittal, {
      detail: { currentPoints: { world: [17, 0, 0] } },
    });

    expect(sagittal.setDisplaySetPresentation).toHaveBeenCalledWith(
      sagittal._dataId,
      expect.objectContaining({ slabThickness: 14 })
    );
    expect(sagittal._presentation.slabThickness).toBe(14);
    expect(axial.setDisplaySetPresentation).not.toHaveBeenCalled();

    // The tool reads/writes through the viewport API and stores no slab
    // state of its own.
    expect(
      Object.keys(tool.getState()).some((key) =>
        key.toLowerCase().includes('slab')
      )
    ).toBe(false);
  });

  it('ignores legacy viewports and 3D viewports as targets and sources', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
    });
    const legacySagittal = createFakeLegacyViewport({
      id: 'legacySagittal',
      orientation: 'sagittal',
    });
    const tool = createTool({
      viewports: [axial, legacySagittal],
      configuration: { sourcePolicy: 'debugAll' },
    });

    // Legacy viewport as render target: nothing.
    expect(computeLines(tool, legacySagittal)).toEqual([]);
    // Legacy viewport as source for a planar target: nothing.
    expect(computeLines(tool, axial)).toEqual([]);
  });
});
