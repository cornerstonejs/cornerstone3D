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
  /** Snap slice navigation to this grid spacing along the normal (mm). */
  snapSpacing = 0,
}) {
  const axes = ORIENTATION_AXES[orientation];
  const camera = {
    viewPlaneNormal: [...axes.normal],
    viewUp: [...axes.v],
    focalPoint: [...focalPoint],
    position: focalPoint.map((v, i) => v + axes.normal[i] * 100),
    parallelScale: 100,
  };
  const presentationScale: [number, number] = [1, 1];

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
          let distance = vec3.dot(delta, camera.viewPlaneNormal as never);

          if (snapSpacing > 0) {
            // Like real viewports with a coarse slice grid: land on the
            // nearest slice of the requested position.
            const currentCoordinate = vec3.dot(
              camera.focalPoint as never,
              camera.viewPlaneNormal as never
            );
            const targetCoordinate = currentCoordinate + distance;
            const snappedCoordinate =
              Math.round(targetCoordinate / snapSpacing) * snapSpacing;
            distance = snappedCoordinate - currentCoordinate;
          }

          camera.focalPoint = camera.focalPoint.map(
            (v, i) => v + camera.viewPlaneNormal[i] * distance
          );
          syncPosition();
        }
      }
    ),
    getScale: () => [...presentationScale],
    setScale: jest.fn((scale: [number, number]) => {
      presentationScale[0] = scale[0];
      presentationScale[1] = scale[1];
    }),
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
      return [dot(rel, axes.u) + HALF, dot(rel, axes.v) + HALF];
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
function createFakeLegacyViewport({
  id,
  orientation = 'axial' as Orientation,
}) {
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

function computeLines(tool: SliceIntersectionTool, targetViewport: unknown) {
  return (
    tool as unknown as {
      _computeLinesForTarget: (viewport) => Array<{
        groupId: string;
        family: string;
        leaderViewportId: string;
        memberViewportIds: string[];
        canvasPoints: [number[], number[]];
        color: string;
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
    const tool = createTool({ viewports: [only] });

    expect(computeLines(tool, only)).toEqual([]);
  });

  it('renders one line per other plane group, derived from the actual plane-plane intersection', () => {
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

    const lines = computeLines(tool, axial);
    expect(lines).toHaveLength(1);

    const [line] = lines;
    expect(line.groupId).toBe('FOR1:sagittal');
    expect(line.family).toBe('sagittal');
    expect(line.leaderViewportId).toBe('sagittal');

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

    expect(line.canvasPoints[0][0]).toBeCloseTo(260);
    expect(line.canvasPoints[1][0]).toBeCloseTo(260);
  });

  it('groups same-plane viewports: duplicates never produce duplicate lines and same-family viewports show no line between each other', () => {
    // Two axials (CT + PT style), two sagittals, two coronals - all same FoR.
    const ctAxial = createFakePlanarViewport({
      id: 'ctAxial',
      orientation: 'axial',
    });
    const ptAxial = createFakePlanarViewport({
      id: 'ptAxial',
      orientation: 'axial',
      focalPoint: [0, 0, 2],
    });
    const ctSagittal = createFakePlanarViewport({
      id: 'ctSagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const ptSagittal = createFakePlanarViewport({
      id: 'ptSagittal',
      orientation: 'sagittal',
      focalPoint: [12, 0, 0],
    });
    const ctCoronal = createFakePlanarViewport({
      id: 'ctCoronal',
      orientation: 'coronal',
      focalPoint: [0, 20, 0],
    });
    const ptCoronal = createFakePlanarViewport({
      id: 'ptCoronal',
      orientation: 'coronal',
      focalPoint: [0, 22, 0],
    });
    const tool = createTool({
      viewports: [
        ctAxial,
        ptAxial,
        ctSagittal,
        ptSagittal,
        ctCoronal,
        ptCoronal,
      ],
    });

    // The axial target sees exactly ONE sagittal line and ONE coronal line -
    // not one per viewport - and no line from the other axial viewport.
    const lines = computeLines(tool, ctAxial);
    expect(lines.map((line) => line.groupId).sort()).toEqual([
      'FOR1:coronal',
      'FOR1:sagittal',
    ]);

    const sagittalLine = lines.find((l) => l.family === 'sagittal');
    expect(sagittalLine.memberViewportIds.sort()).toEqual([
      'ctSagittal',
      'ptSagittal',
    ]);

    // Same for the PT axial viewport.
    expect(computeLines(tool, ptAxial)).toHaveLength(2);
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
        'activeGroupId',
        'activeOperation',
        'activeTargetViewportId',
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
    const tool = createTool({ viewports: [axial, sagittal] });

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
    (worldCrosshair as unknown as Record<string, unknown>)._getLinkedViewports =
      () => [];
    worldCrosshair.setWorldPoint([-500, 123, 987]);

    const after = computeLines(tool, axial);
    expect(after).toHaveLength(1);
    expect(after[0].canvasPoints).toEqual(before[0].canvasPoints);
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
    });

    expect(computeLines(tool, axial)).toEqual([]);
  });

  it('keeps a rotated plane in its sticky family (no group swap past 45 degrees)', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
    });
    const coronal = createFakePlanarViewport({
      id: 'coronal',
      orientation: 'coronal',
      focalPoint: [0, 10, 0],
    });
    const tool = createTool({ viewports: [axial, coronal] });

    expect(computeLines(tool, axial)[0].groupId).toBe('FOR1:coronal');

    // Rotate the coronal plane 60 degrees around x: its dominant axis is now
    // z (axial-ish), but the sticky family keeps it coronal.
    const angle = Math.PI / 3;
    coronal._camera.viewPlaneNormal = [0, Math.cos(angle), Math.sin(angle)];

    const lines = computeLines(tool, axial);
    expect(lines).toHaveLength(1);
    expect(lines[0].groupId).toBe('FOR1:coronal');
    expect(lines[0].family).toBe('coronal');
  });

  it('prefers a volume-backed member as the group leader', () => {
    const stackAxial = createFakePlanarViewport({
      id: 'stackAxial',
      orientation: 'axial',
      contentMode: 'stack',
    });
    const volumeAxial = createFakePlanarViewport({
      id: 'volumeAxial',
      orientation: 'axial',
      focalPoint: [0, 0, 5],
    });
    const sagittal = createFakePlanarViewport({
      id: 'sagittal',
      orientation: 'sagittal',
    });
    const tool = createTool({
      viewports: [stackAxial, volumeAxial, sagittal],
    });

    const groups = tool.getPlaneGroups();
    const axialGroup = groups.find((group) => group.family === 'axial');

    expect(axialGroup.viewportIds.sort()).toEqual([
      'stackAxial',
      'volumeAxial',
    ]);
    expect(axialGroup.leaderViewportId).toBe('volumeAxial');
  });

  it('dragging a line translates every member of the plane group and nothing else', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const ctCoronal = createFakePlanarViewport({
      id: 'ctCoronal',
      orientation: 'coronal',
      focalPoint: [0, 10, 0],
    });
    const ptCoronal = createFakePlanarViewport({
      id: 'ptCoronal',
      orientation: 'coronal',
      focalPoint: [0, 10, 0],
    });
    const tool = createTool({ viewports: [axial, ctCoronal, ptCoronal] });

    const applyTranslate = (
      tool as unknown as {
        _applyTranslate: (members, evt, editData) => void;
      }
    )._applyTranslate.bind(tool);

    // Total drag delta [3, 4, 5]: only its projection on the coronal normal
    // ([0, 1, 0]) scrolls the coronal group - BOTH coronal viewports.
    applyTranslate(
      [ctCoronal, ptCoronal],
      {
        detail: {
          startPoints: { world: [0, 0, 0] },
          currentPoints: { world: [3, 4, 5] },
        },
      },
      {
        targetViewportId: 'axial',
        groupId: 'FOR1:coronal',
        memberViewportIds: ['ctCoronal', 'ptCoronal'],
        operation: 'translate',
      }
    );

    expect(ctCoronal._camera.focalPoint).toEqual([0, 14, 0]);
    expect(ptCoronal._camera.focalPoint).toEqual([0, 14, 0]);
    expect(ctCoronal.render).toHaveBeenCalled();
    expect(ptCoronal.render).toHaveBeenCalled();

    // The unrelated (target) viewport camera is untouched.
    expect(axial.setViewReference).not.toHaveBeenCalled();
    expect(axial._camera.focalPoint).toEqual([0, 0, 0]);
  });

  it('does not lose drag motion to per-member slice snapping (coarse grids follow the total delta)', () => {
    // A coarse member (5mm grid, like PET) alongside a fine one.
    const fineCoronal = createFakePlanarViewport({
      id: 'fineCoronal',
      orientation: 'coronal',
      focalPoint: [0, 0, 0],
    });
    const coarseCoronal = createFakePlanarViewport({
      id: 'coarseCoronal',
      orientation: 'coronal',
      focalPoint: [0, 0, 0],
      snapSpacing: 5,
    });
    const tool = createTool({ viewports: [fineCoronal, coarseCoronal] });

    const applyTranslate = (
      tool as unknown as {
        _applyTranslate: (members, evt, editData) => void;
      }
    )._applyTranslate.bind(tool);

    const editData = {
      targetViewportId: 'axial',
      groupId: 'FOR1:coronal',
      memberViewportIds: ['fineCoronal', 'coarseCoronal'],
      operation: 'translate',
    };
    const members = [fineCoronal, coarseCoronal];

    // Two slow 2mm ticks (each below half the 5mm grid). Naive per-tick
    // integration from the snapped position would leave the coarse member
    // stuck at 0 forever; anchored targeting lands it on the 5mm slice once
    // the TOTAL delta crosses half the spacing.
    applyTranslate(
      members,
      {
        detail: {
          startPoints: { world: [0, 0, 0] },
          currentPoints: { world: [0, 2, 0] },
        },
      },
      editData
    );
    applyTranslate(
      members,
      {
        detail: {
          startPoints: { world: [0, 0, 0] },
          currentPoints: { world: [0, 4, 0] },
        },
      },
      editData
    );

    expect(fineCoronal._camera.focalPoint).toEqual([0, 4, 0]);
    expect(coarseCoronal._camera.focalPoint).toEqual([0, 5, 0]);
  });

  it('rotating reorients all volume-backed members together and skips stacks', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const ctSagittal = createFakePlanarViewport({
      id: 'ctSagittal',
      orientation: 'sagittal',
      focalPoint: [0, 0, 0],
    });
    const ptSagittal = createFakePlanarViewport({
      id: 'ptSagittal',
      orientation: 'sagittal',
      focalPoint: [0, 0, 0],
    });
    const stackSagittal = createFakePlanarViewport({
      id: 'stackSagittal',
      orientation: 'sagittal',
      contentMode: 'stack',
    });
    const tool = createTool({
      viewports: [axial, ctSagittal, ptSagittal, stackSagittal],
    });

    const applyRotate = (
      tool as unknown as {
        _applyRotate: (members, evt, editData) => void;
      }
    )._applyRotate.bind(tool);

    const beforeNormal = [...ctSagittal._camera.viewPlaneNormal];

    applyRotate(
      [ctSagittal, ptSagittal, stackSagittal],
      {
        detail: {
          currentPoints: { canvas: [HALF + 100, HALF + 100] },
          deltaPoints: { canvas: [0, 100] },
        },
      },
      {
        targetViewportId: 'axial',
        groupId: 'FOR1:sagittal',
        memberViewportIds: ['ctSagittal', 'ptSagittal', 'stackSagittal'],
        operation: 'rotate',
        pivotWorld: [0, 0, 0],
        rotationAxis: [0, 0, 1],
      }
    );

    // Both volume members rotated identically...
    expect(
      vec3.dot(
        ctSagittal._camera.viewPlaneNormal as never,
        beforeNormal as never
      )
    ).toBeLessThan(0.999);
    expect(ctSagittal._camera.viewPlaneNormal).toEqual(
      ptSagittal._camera.viewPlaneNormal
    );

    // ...their on-screen scale is re-asserted so fit-based scaling cannot
    // pulse the zoom while rotating...
    expect(ctSagittal.setScale).toHaveBeenCalledWith([1, 1]);
    expect(ptSagittal.setScale).toHaveBeenCalledWith([1, 1]);

    // ...the stack member cannot reorient and was skipped...
    expect(stackSagittal.setViewReference).not.toHaveBeenCalled();

    // ...and the target viewport is untouched.
    expect(axial._camera.viewPlaneNormal).toEqual([0, 0, 1]);
    expect(axial.setViewReference).not.toHaveBeenCalled();
  });

  it('slab handles modify the slab of every volume-backed member through the display-set presentation', () => {
    const axial = createFakePlanarViewport({
      id: 'axial',
      orientation: 'axial',
      focalPoint: [0, 0, 0],
    });
    const ctSagittal = createFakePlanarViewport({
      id: 'ctSagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const ptSagittal = createFakePlanarViewport({
      id: 'ptSagittal',
      orientation: 'sagittal',
      focalPoint: [10, 0, 0],
    });
    const tool = createTool({ viewports: [axial, ctSagittal, ptSagittal] });

    const applySlabThickness = (
      tool as unknown as {
        _applySlabThickness: (members, evt, editData) => void;
      }
    )._applySlabThickness.bind(tool);

    // Cursor 7mm from the sagittal plane -> slab thickness 14mm.
    applySlabThickness(
      [ctSagittal, ptSagittal],
      {
        detail: { currentPoints: { world: [17, 0, 0] } },
      },
      {
        targetViewportId: 'axial',
        groupId: 'FOR1:sagittal',
        memberViewportIds: ['ctSagittal', 'ptSagittal'],
        operation: 'slabThickness',
      }
    );

    expect(ctSagittal.setDisplaySetPresentation).toHaveBeenCalledWith(
      ctSagittal._dataId,
      expect.objectContaining({ slabThickness: 14 })
    );
    expect(ptSagittal.setDisplaySetPresentation).toHaveBeenCalledWith(
      ptSagittal._dataId,
      expect.objectContaining({ slabThickness: 14 })
    );
    expect(axial.setDisplaySetPresentation).not.toHaveBeenCalled();

    // The tool reads/writes through the viewport API and stores no slab
    // state of its own.
    expect(
      Object.keys(tool.getState()).some((key) =>
        key.toLowerCase().includes('slab')
      )
    ).toBe(false);
  });

  it('aligns plane-group members to the group leader plane', () => {
    const ctCoronal = createFakePlanarViewport({
      id: 'ctCoronal',
      orientation: 'coronal',
      focalPoint: [0, 12, 0],
    });
    const ptCoronal = createFakePlanarViewport({
      id: 'ptCoronal',
      orientation: 'coronal',
      focalPoint: [0, 7, 0],
    });
    const tool = createTool({ viewports: [ctCoronal, ptCoronal] });

    (tool as unknown as { _alignPlaneGroups: () => void })._alignPlaneGroups();

    // The non-leader member moved along its own normal onto the leader
    // plane (y = 12); the leader stayed put.
    expect(ctCoronal._camera.focalPoint).toEqual([0, 12, 0]);
    expect(ptCoronal._camera.focalPoint).toEqual([0, 12, 0]);
  });

  it('ignores legacy viewports and 3D viewports as targets and group members', () => {
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
    });

    // Legacy viewport as render target: nothing.
    expect(computeLines(tool, legacySagittal)).toEqual([]);
    // Legacy viewport as a group source for a planar target: nothing.
    expect(computeLines(tool, axial)).toEqual([]);
  });
});
