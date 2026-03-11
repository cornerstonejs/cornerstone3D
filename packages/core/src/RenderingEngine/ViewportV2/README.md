# ViewportV2 Architecture

`ViewportV2` is the new render-path-driven viewport layer in `packages/core`.
It exists to keep viewport controllers small while moving render-mode-specific
behavior into dedicated render paths.

## Design Goals

- Keep the base controller generic.
- Keep viewport-specific controllers thin.
- Keep CPU, VTK, image, volume, and media runtime behavior in render paths.
- Reuse legacy viewport behavior through shared helpers when that behavior is
  already proven.

## Main Pieces

- `ViewportV2.ts`
  Generic controller that owns bindings, shared camera state, shared
  per-data presentation state, and render dispatch.
- `ViewportArchitectureTypes.ts`
  Shared contracts for controllers, data providers, render paths, render-path
  contexts, and compatibility helpers such as pan/zoom capability guards.
- `DefaultRenderPathResolver.ts`
  Registry and matching layer that maps `(viewport type, logical data,
renderMode)` to a concrete render path.
- `Planar/`, `Volume3D/`, `Video/`, `ECG/`, `WSI/`
  Thin viewport controllers plus their render-path-specific implementations and
  viewport-local helpers.

## Runtime Flow

1. A V2 viewport controller is created through the normal rendering-engine
   `enableElement` flow.
2. The controller receives a `dataId` through `setDataId(...)`.
3. The viewport data provider resolves that `dataId` into a logical data object.
4. The render path resolver chooses the render path for the viewport `type`,
   logical data, and requested `renderMode`.
5. The render path attaches runtime rendering state and returns a mounted rendering.
6. `ViewportV2` stores a binding that can forward data-presentation, camera,
   resize, and render updates back to that render path.
7. Tooling and viewport APIs operate on shared controller state; render paths apply
   that state to the concrete runtime.

## Responsibilities

### `ViewportV2`

- Own shared viewport state.
- Coordinate data attachment and binding lifecycle.
- Broadcast shared camera changes to all active bindings.
- Store per-data presentation state keyed by `dataId`.
- Expose shared transforms like `canvasToWorld` and `worldToCanvas` through the
  current binding.

### Viewport Controllers

- Own viewport-facing behavior and public API for one viewport family.
- Create the render context used by render paths.
- Choose the data provider and render path resolver when defaults are not
  sufficient.
- Keep modality-specific or data-presentation-specific orchestration local to that
  viewport family.

### Render Paths

- Attach and detach runtime objects.
- Interpret shared camera state for one render path.
- Apply per-data presentation updates for one render path.
- Implement render-path-specific coordinate transforms when needed.

## Data Model

`ViewportV2` does not attach raw VTK or DOM objects directly from the
controller. It works with three layers:

- `dataId`
  Stable application-facing identifier passed to the viewport.
- `LogicalDataObject`
  Loaded data returned by a data provider. This is the render-path selection input.
- `MountedRendering`
  Render-path-owned runtime state after attach.

This separation keeps loading, render-path selection, and runtime rendering
state independent.

## Migration Guidance

- If the behavior already exists in `StackViewport`, `VolumeViewport`, or
  `BaseVolumeViewport`, treat legacy behavior as the source of truth first.
- Do not move legacy logic directly into `ViewportV2.ts`.
- If both legacy and V2 need the same behavior, extract a shared helper under
  `src/utilities/` or `src/RenderingEngine/helpers/`.
- If behavior is only relevant to one render path, keep it in that renderPath.

## Current Viewport Families

- `PlanarViewportV2`
  Converges old stack and old volume-slice behavior across CPU and VTK paths.
- `VolumeViewport3DV2`
  3D volume and geometry viewport using VTK volume or geometry render paths.
- `VideoViewportV2`
  HTML video-backed viewport.
- `ECGViewportV2`
  Canvas ECG rendering path.
- `WSIViewportV2`
  Whole slide imaging viewport.

## Practical Rule

If a change only matters to one render path, it should usually go into that
render path or a helper used by that render path, not into `ViewportV2.ts`.
