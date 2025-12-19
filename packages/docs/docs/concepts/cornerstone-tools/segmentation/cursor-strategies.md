---
id: cursor-strategies
title: Custom Cursor Geometry & Fill Strategies
summary: Pair bespoke brush cursors with fill predicates by wiring BrushStrategy callbacks for geometry calculation, SVG rendering, and point-in-shape evaluation.
---

# Custom Cursor Geometry & Fill Strategies

Segmentation tools expose `BrushStrategy` hooks that let you draw any cursor footprint and reuse the exact same geometry while painting. The cursor is not just a visual hint—`BrushTool` copies the geometry calculated during hover into the `operationData` that powers the fill strategy. This section explains how to customize both halves so a new cursor footprint (e.g. a square, diamond, or oblique polygon) fills exactly the pixels that the user expects.

## Lifecycle Overview

1. `BrushTool` builds `hoverData` (see `LabelmapBaseTool.createHoverData`) whenever the pointer moves.
2. The active `BrushStrategy` is asked to run `StrategyCallbacks.CalculateCursorGeometry`. This callback can populate `hoverData.brushCursor.data.handles` with world-space points that describe the cursor.
3. Immediately afterwards `StrategyCallbacks.RenderCursor` receives the same `operationData` as well as an `SVGDrawingHelper`. Use this callback to render the cursor in canvas space.
4. When the user paints, `LabelmapBaseTool.getOperationData` copies `brushCursor.data.handles.points` into `operationData.points` and forwards the original `hoverData` to the active strategy.
5. The strategy's `StrategyCallbacks.Initialize` implementation maps those points into index space, computes `operationData.isInObject`, and optionally updates `operationData.strokePointsWorld` so the fill and cursor stay aligned even while dragging.

Keeping the cursor computation and the fill predicate in sync ensures that the sweep volume painted into the labelmap matches what was rendered on screen.

## Step 1: Calculate World-Space Geometry

Implement a composition that handles `StrategyCallbacks.CalculateCursorGeometry`. The callback receives the enabled element, the tool configuration, and the latest `hoverData`:

```ts
import { Enums } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/core';

const { StrategyCallbacks } = Enums;

export const hexCursorComposition = {
  [StrategyCallbacks.CalculateCursorGeometry]: (
    enabledElement,
    operationData
  ) => {
    const { viewport } = enabledElement;
    const { configuration, hoverData } = operationData;
    const { brushCursor, centerCanvas } = hoverData;
    const camera = viewport.getCamera();
    const brushRadius = configuration.brushSize;

    const centerWorld = viewport.canvasToWorld(centerCanvas) as Types.Point3;
    const polygonWorld = createHexagonCorners(
      centerWorld,
      camera.viewUp,
      camera.viewPlaneNormal,
      brushRadius
    );

    // BrushTool automatically copies handles.points into operationData.points.
    brushCursor.data.handles = {
      points: buildOrthogonalHandles(polygonWorld),
      polygonWorld,
    };
    brushCursor.data.invalidated = false;
  },
};
```

Guidelines:

- Normalize `viewUp`/`viewPlaneNormal` before deriving `viewRight` so oblique planes behave consistently.
- Always populate `handles.points` in the `[bottom, top, left, right]` order. Existing strategies (e.g. `fillCircle.ts`) expect that ordering when computing centers and radii.
- Attach any extra data you need (such as `polygonWorld` or precomputed normals) on `brushCursor.data.handles`. It will be available through `operationData.hoverData` inside your fill strategy.

## Step 2: Render the Custom Cursor

The render callback is responsible for drawing canvas-space overlays based on the world-space geometry calculated earlier. Leverage the shared SVG helpers in `packages/tools/src/drawingSvg` to keep the output consistent with the rest of the tooling:

```ts
import { Enums, drawing } from '@cornerstonejs/tools';

const { StrategyCallbacks } = Enums;
const { drawPolyline: drawPolylineSvg } = drawing;

hexCursorComposition[StrategyCallbacks.RenderCursor] = (
  enabledElement,
  operationData,
  svgDrawingHelper
) => {
  const { viewport } = enabledElement;
  const { brushCursor } = operationData.hoverData;
  const polygonWorld = brushCursor.data.handles?.polygonWorld ?? [];

  if (polygonWorld.length === 0) {
    return;
  }

  const polygonCanvas = polygonWorld.map((point) =>
    viewport.worldToCanvas(point)
  );

  const annotationUID = brushCursor.metadata?.brushCursorUID;
  drawPolylineSvg(svgDrawingHelper, annotationUID, 'hexagon', polygonCanvas, {
    color: `rgb(${brushCursor.metadata.segmentColor?.slice(0, 3) ?? [0, 255, 0]})`,
    lineDash:
      operationData.centerSegmentIndexInfo.segmentIndex === 0
        ? [1, 2]
        : undefined,
    closed: true,
  });
};
```

Keep the render step lightweight—`BrushTool` triggers it on every mouse move. Avoid re-computing world-space data here; cache everything during `CalculateCursorGeometry`.

## Step 3: Build a Matching Fill Strategy

A fill strategy is a `BrushStrategy` instance that wires together reusable compositions. The class lives in `packages/tools/src/tools/segmentation/strategies/BrushStrategy.ts` (or `@cornerstonejs/tools/dist/tools/segmentation/strategies/BrushStrategy` when consuming the npm package). The `StrategyCallbacks.Initialize` portion is where you convert the cursor geometry into the predicate used by `compositions.regionFill`:

```ts
import BrushStrategy from '@cornerstonejs/tools/dist/tools/segmentation/strategies/BrushStrategy';
import { Enums, utilities } from '@cornerstonejs/tools';
import { utilities as csUtils } from '@cornerstonejs/core';

const { StrategyCallbacks } = Enums;
const { getBoundingBoxAroundShapeIJK } = utilities.boundingBox;
const { transformWorldToIndex } = csUtils;
const {
  regionFill,
  setValue,
  determineSegmentIndex,
  preview,
  labelmapStatistics,
} = BrushStrategy.COMPOSITIONS;

const initializeHexagon = {
  [StrategyCallbacks.Initialize]: (operationData) => {
    const { segmentationImageData, hoverData } = operationData;
    const worldPolygon = hoverData?.brushCursor?.data?.handles?.polygonWorld;

    if (!Array.isArray(worldPolygon) || worldPolygon.length === 0) {
      return;
    }

    const polygonIJK = worldPolygon.map((worldPoint) =>
      transformWorldToIndex(segmentationImageData, worldPoint)
    );

    operationData.isInObject = createPointInPolygon(
      worldPolygon,
      segmentationImageData
    );
    operationData.isInObjectBoundsIJK = getBoundingBoxAroundShapeIJK(
      polygonIJK,
      segmentationImageData.getDimensions()
    );

    // Preserve stroke continuity for drag operations.
    operationData.strokePointsWorld = [
      ...(operationData.strokePointsWorld ?? []),
      ...worldPolygon,
    ];
  },
};

export const HEXAGON_STRATEGY = new BrushStrategy(
  'Hexagon',
  regionFill,
  setValue,
  initializeHexagon,
  determineSegmentIndex,
  preview,
  labelmapStatistics,
  hexCursorComposition
);

export const fillInsideHexagon = HEXAGON_STRATEGY.strategyFunction;
```

`createPointInPolygon` above represents whichever predicate you implement to classify voxels. Many strategies cache both the polygon plane and its normal so the predicate can avoid redundant transforms.

Important details:

- `operationData.isInObject` must be an efficient point-in-shape predicate because it runs on every candidate voxel.
- Always update `operationData.isInObjectBoundsIJK`; `regionFill` short-circuits iteration using this bounding box.
- Reuse `operationData.strokePointsWorld` to describe the swept volume of a drag. Strategies such as `fillCircle.ts` densify the stroke to avoid holes when the cursor moves faster than the event rate.
- Compose existing helpers such as `getBoundingBoxAroundShapeIJK`, `pointInSphere`, or custom polygon math to keep the predicates deterministic.

## Wiring the Strategy into BrushTool

Register the new strategy function with the `BrushTool` configuration inside your `ToolGroup`:

```ts
import {
  addTool,
  BrushTool,
  ToolGroupManager,
  Enums,
} from '@cornerstonejs/tools';
import { fillInsideHexagon } from './strategies/fillHexagon';

addTool(BrushTool);
const toolGroup = ToolGroupManager.createToolGroup('segmentationGroup');
toolGroup.addTool(BrushTool.toolName);

const brushConfig = toolGroup.getToolConfiguration(BrushTool.toolName) ?? {};

toolGroup.setToolConfiguration(
  BrushTool.toolName,
  {
    ...brushConfig,
    strategies: {
      ...(brushConfig.strategies ?? {}),
      FILL_INSIDE_HEXAGON: fillInsideHexagon,
    },
    defaultStrategy: 'FILL_INSIDE_HEXAGON',
    activeStrategy: 'FILL_INSIDE_HEXAGON',
  },
  true
);

toolGroup.setToolActive(BrushTool.toolName, {
  bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
  strategy: 'FILL_INSIDE_HEXAGON',
});
```

Use `setToolConfiguration` if you need to swap strategies at runtime:

```ts
toolGroup.setToolConfiguration(BrushTool.toolName, {
  activeStrategy: 'FILL_INSIDE_HEXAGON',
});
```

`BrushStrategy` automatically falls back to the default circular cursor when a composition does not implement the cursor callbacks, so you can selectively apply the custom cursor only to the strategies that require it.

## Matching Cursor and Fill Logic: Best Practices

- **Share world-space data**: Write every geometry primitive you need into `brushCursor.data.handles`. The fill strategy can read it back from `operationData.hoverData` without recomputing.
- **Stay idempotent**: Callbacks may run multiple times per frame. Avoid mutating shared instances; clone vectors with `vec3.clone` before caching.
- **Obey coordinate systems**: `CalculateCursorGeometry` works in world coordinates, `RenderCursor` works in canvas coordinates, and `Initialize` must convert to IJK using `transformWorldToIndex`.
- **Guard performance**: Keep predicates branch-light and memoize expensive transforms. `BrushStrategy` executes inside tight voxel loops.
- **Test point-in-shape functions**: Jest unit tests similar to `packages/tools/src/tools/segmentation/strategies/__tests__/fillCircle.spec.ts` help catch regressions.
- **Handle fast drags**: Populate `operationData.strokePointsWorld` (and densify long segments) so the predicate covers every point swept by the cursor.

By following these steps you can confidently deliver new cursor footprints together with matching fill behavior, ensuring artists see exactly what will be written into their segmentations.
