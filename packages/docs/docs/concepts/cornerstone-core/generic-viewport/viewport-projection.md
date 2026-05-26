---
id: viewport-projection
title: Viewport Projection
summary: How Generic Viewport exposes cross-viewport presentation, transforms, and renderer-camera output without making ICamera universal
---

# Viewport Projection

Viewport Projection is the Generic Viewport construct for asking how a
viewport's semantic state maps into presentation, coordinate transforms, and
renderer output.

It exists because `zoom`, `scale`, `pan`, and camera fields do not mean the same
thing for every viewport family. A planar viewport has a semantic anchor,
slice geometry, display area, and derived renderer camera. A 3D viewport is
runtime-camera-backed. Video, ECG, and WSI have their own mapping rules. The
shared abstraction is therefore not `ICamera`; `ICamera` remains renderer
output when a renderer needs it.

## What "projection" means here

In this codebase, "projection" is the mathematical sense — the act of
_projecting_ a viewport's semantic state onto a presentation, a set of
coordinate transforms, and (when applicable) a renderer camera. A `Projection`
is the adaptation seam between a viewport's internal model and the cross-family
surface that synchronizers and tools consume.

It is **not** VTK's parallel-vs-perspective projection (`parallelProjection`,
`setParallelProjection`). That concept is a renderer-matrix setting and lives
inside the resolved `ICamera` payload (`rendererCamera.parallelProjection`).
Both terms can coexist in the same code path:

```ts
// Cross-viewport projection adapter — this file's subject.
const snapshot = viewportProjection.get(viewport);

// VTK projection matrix — unrelated, set on the renderer camera.
snapshot?.rendererCamera?.parallelProjection; // boolean
```

If you are reading code that mentions "projection," check the noun: a
`ProjectionSnapshot`, `ViewportProjectionAdapter`, or `viewportProjection`
refers to the cross-viewport seam below. A `parallelProjection` flag or
`setParallelProjection` call refers to VTK's render-matrix mode.

## Public Contract And Stability

The stable entry point is the projection service and the generic projection
types:

- `viewportProjection`
- `ViewportProjectionService`
- `ViewportProjectionTypes.ts`
- `ProjectionSnapshot`
- `ProjectionPresentation`
- `ProjectionScale`
- `ProjectionPosition`
- `ViewportProjectionAdapter`

The family namespaces are intentionally exported as advanced helpers:

- `planarProjection`
- `volume3DProjection`
- `videoProjection`
- `ecgProjection`
- `wsiProjection`

Use those namespaces when building a custom synchronizer, tool, test, or new
viewport family that needs lower-level snapshot or renderer-camera behavior.
They are a tier below the core viewport methods and may change while the
Generic Viewport API is still settling. Application code should prefer
`viewportProjection.getPresentation()` and
`viewportProjection.withPresentation()` for presentation reads and writes.
Direct Next viewport instances intentionally do not expose
`getViewPresentation()` or `setViewPresentation()`.

## Core Types

The projection interface lives in `ViewportProjectionTypes.ts`.

```ts
interface ViewportProjectionAdapter<TViewState, TPresentation> {
  id: string;
  viewportTypes: string[];

  getSnapshot(request: ProjectionRequest): ProjectionSnapshot | undefined;
  getPresentation(
    snapshot: ProjectionSnapshot,
    selector?: ViewPresentationSelector
  ): TPresentation;
  withPresentation(
    snapshot: ProjectionSnapshot,
    presentation: Partial<TPresentation>,
    options?: ProjectionWriteOptions
  ): TViewState;
  applyToRenderer?(snapshot: ProjectionSnapshot, target: unknown): void;
}
```

A `ProjectionSnapshot` is capability-based:

```ts
interface ProjectionSnapshot {
  kind: string;
  frameOfReferenceUID?: string;

  spaces: {
    canvas?: boolean;
    world?: boolean;
    image?: boolean;
    renderer?: boolean;
  };

  transforms?: {
    canvasToWorld?(point: Point2): Point3;
    worldToCanvas?(point: Point3): Point2;
  };

  presentation: ProjectionPresentation;
  rendererCamera?: ICamera;
}
```

If a viewport cannot provide a transform, it should omit that capability. Do
not add placeholder transforms just to satisfy a universal shape.

## Semantic Scale And Position

Projection scale and position are tagged so callers can read intent before
using values:

```ts
type ProjectionScale =
  | { kind: 'fit'; value: number }
  | { kind: 'fitWidth'; value: number }
  | { kind: 'fitHeight'; value: number }
  | { kind: 'displayArea'; value: number; area: DisplayArea }
  | { kind: 'nativePixel'; pixelsPerCanvasPixel: number }
  | { kind: 'physical'; mmPerCanvasPixel: number }
  | {
      kind: 'signal';
      samplesPerCanvasPixel: number;
      valueUnitsPerCanvasPixel: number;
    };

type ProjectionPosition =
  | { kind: 'anchor'; worldPoint?: Point3; canvasPoint: Point2 }
  | { kind: 'imagePoint'; imagePoint: Point2; canvasPoint: Point2 }
  | { kind: 'mediaPoint'; mediaPoint: Point2; canvasPoint: Point2 }
  | {
      kind: 'signalPoint';
      sampleIndex: number;
      value: number;
      channelIndex: number;
      canvasPoint: Point2;
    }
  | { kind: 'focalPoint'; worldPoint: Point3 };
```

Do not treat `presentation.zoom`, `presentation.scale`, or `presentation.pan`
as universal values. Use the tag first, then branch on the semantics your
tool or synchronizer supports.

## Projection Service

The package-level projection service is exported as `viewportProjection`.

```ts
import { viewportProjection } from '@cornerstonejs/core';

const projection = viewportProjection.get(viewport, {
  kind: 'planar',
  dataId,
});
```

The service is package/global, not per rendering engine. That keeps custom
synchronizers and advanced tools independent from rendering-engine ownership.

Built-in viewport types and explicit `kind` requests have typed helper aliases
for downstream code:

```ts
import type {
  ProjectionPresentationForKind,
  ProjectionSnapshotForKind,
  ProjectionViewStateForKind,
} from '@cornerstonejs/core';

type PlanarSnapshot = ProjectionSnapshotForKind<'planar'>;
type PlanarPresentation = ProjectionPresentationForKind<'planar'>;
type PlanarViewState = ProjectionViewStateForKind<'planar'>;
```

When the viewport instance has a literal Next viewport type, the service can
infer those same types from the viewport argument. Explicit `kind` requests are
available for custom synchronizers that only know a viewport as `unknown`.

Built-in adapters are registered for:

- `planarProjection`
- `volume3DProjection`
- `videoProjection`
- `ecgProjection`
- `wsiProjection`

The advanced namespaces expose lower-level helpers for code that intentionally
works below the core viewport API.

`createZoomPanSynchronizer` in `@cornerstonejs/tools` already uses the service
when both source and target viewports expose projection adapters, then falls
back to the older `getZoom`/`setZoom` and `getPan`/`setPan` capability checks
for legacy viewport families.

## When To Care

Most application code should use `setViewState` for native viewport mutation,
`getViewReference` / `setViewReference` for spatial navigation, and
`canvasToWorld` / `worldToCanvas` for coordinate conversion. Use projection
when code needs a portable presentation layer across viewport families.

Use Viewport Projection when you are writing:

- a custom synchronizer that needs to work across viewport families
- a tool that must inspect capabilities before transforming points
- a new Generic Viewport family
- a bridge between semantic state and renderer-specific camera output

## Reading A Projection

Check capabilities before using transforms:

```ts
const projection = viewportProjection.get(viewport);

if (projection?.spaces.canvas && projection.spaces.world) {
  const worldPoint = projection.transforms?.canvasToWorld?.([100, 120]);
}
```

Check scale and position semantics before applying them:

```ts
const scale = projection?.presentation.scale;

if (scale?.kind === 'displayArea') {
  syncDisplayArea(scale.area);
}

if (scale?.kind === 'physical') {
  syncPhysicalSpacing(scale.mmPerCanvasPixel);
}
```

## Writing Presentation

Use `withPresentation` when you need the adapter to translate a presentation
patch back into semantic state:

```ts
const nextState = viewportProjection.withPresentation(viewport, {
  zoom: 2,
  pan: [10, -5],
});

if (nextState) {
  viewport.setViewState(nextState);
}
```

Next viewports intentionally do not expose `setViewPresentation`. The
projection service is the portable write layer, and `setViewState` remains the
only Next viewport mutation primitive. They also do not expose
`getViewPresentation`; use `viewportProjection.getPresentation(viewport,
{ selector })` instead. Legacy compatibility adapters may still expose
`getViewPresentation` and `setViewPresentation` for older code.

Before, legacy or compatibility code might do this:

```ts
const presentation = viewport.getViewPresentation({
  pan: true,
  zoom: true,
});

viewport.setViewPresentation({
  zoom: presentation.zoom * 2,
});
```

Direct Next code should do this:

```ts
const presentation = viewportProjection.getPresentation(viewport, {
  selector: {
    pan: true,
    zoom: true,
  },
});

const nextViewState = viewportProjection.withPresentation(viewport, {
  zoom: (presentation?.zoom ?? 1) * 2,
});

if (nextViewState) {
  viewport.setViewState(nextViewState);
}
```

Do not make a custom projection adapter mutate its viewport. It should return
native view state and let the caller decide whether to call `setViewState`.

## Adding A New Adapter

For a new Generic Viewport family:

1. Define the family-specific snapshot and presentation types.
2. Implement `getSnapshot` from current semantic state and resolved geometry.
3. Implement `getPresentation` for the existing public view-presentation shape.
4. Implement `withPresentation` as a pure translation back to semantic state.
5. Implement `applyToRenderer` only if the viewport can produce renderer output.
6. Register the adapter in the Generic Viewport projection setup.

The adapter should not mutate the viewport in `withPresentation`. Return the
next semantic state and let the viewport decide how to apply it.

## Current Adapters

Planar projection uses:

- `PlanarViewState` as semantic state
- `PlanarSliceBasis` and resolved view geometry for data/world/canvas mapping
- `PlanarResolvedICamera` only as renderer output
- compatibility helpers for legacy `getZoom`, `getPan`, and `getScale`

Volume3D projection uses:

- the current runtime VTK camera as its state source
- focal point as semantic position when available
- physical canvas spacing derived from `parallelScale`
- `ICamera` as renderer output

Video projection uses:

- `VideoViewState` as semantic state
- intrinsic media-pixel coordinates for world/canvas conversion
- `mediaPoint` position tags
- `nativePixel` scale tags
- optional renderer-camera output for legacy interop

ECG projection uses:

- `ECGViewState` as semantic state
- signal tuples shaped as `[sampleIndex, amplitudeValue, channelIndex]`
- `signalPoint` position tags
- `signal` scale tags with samples and value units per canvas pixel
- optional renderer-camera output for legacy interop

WSI projection uses:

- `WSIViewState` synchronized from OpenLayers
- slide/world transforms from the WSI resolved view
- `anchor` position tags
- physical scale when renderer-camera output can provide it

This gives cross-viewport callers one projection interface while preserving
the real differences between viewport families.
