---
id: render-backends
title: Render Backends
summary: How planar Generic Viewports select a render backend, and how extensions register additional backends with registerRenderBackend
---

# Render Backends

A render backend is the named rendering implementation a planar Generic
Viewport mounts data through. Cornerstone ships two concrete backends, `'gpu'`
(VTK/WebGL) and `'cpu'`, plus the `'auto'` preference that resolves to one of
them from the capability detection performed at `init()` (WebGL availability,
texture-format probes, and the deprecated `useCPURendering` flag).

Backends are addressed by plain wire strings. The `Enums.RenderBackends`
constants object maps readable names to those strings (`RenderBackends.GPU ===
'gpu'`) and, unlike a TypeScript enum, grows at runtime as extension backends
register themselves.

## Selecting A Backend

The backend used for a mounted dataset is resolved with this precedence:

1. The per-mount `renderBackend` option on `setDisplaySets()` /
   `addDisplaySet()`. A concrete backend pins that dataset; `'auto'` resolves
   from capability detection even when the global backend is pinned.
2. The global configuration at `rendering.planar.renderBackend`, set at
   `init()` or changed at runtime with `setRenderBackend()`.
3. The `'auto'` resolution: CPU when no usable WebGL context was detected,
   GPU otherwise.

`setRenderBackend(backend, reason?)` live-switches all mounted viewports in
place — viewport ids, mounted data, cameras, presentation state, and tool
annotations are preserved; only the render paths are rebuilt. It emits
`RENDER_BACKEND_CHANGED` on the eventTarget. Cornerstone never switches
backends on its own: applications listening to degradation events
(`WEBGL_CONTEXT_LOST`, `RENDER_PATH_ERROR`) are expected to call it, typically
after prompting the user.

`getRenderBackend()` returns the configured preference;
`getEffectiveRenderBackend()` returns the resolved concrete backend.

## Registering A Custom Backend

:::caution Experimental
Registered custom backends are not fully functional yet, and the registration
API is intentionally incomplete. `registerRenderBackend()` currently captures
the wiring the planar viewport needs to select and mount a backend, but it is
intended to grow additional parameters describing the backend-specific
changes and behaviours it registers — for example participation in the
`'auto'` capability resolution, backend-owned canvas/surface creation instead
of drawing to an existing surface, and per-backend context-loss/degradation
handling. Expect the `RegisterRenderBackendOptions` shape to change.
:::

`registerRenderBackend()` follows the same extensible-enum model as
`registerViewportType`: the backend id becomes a valid value for
`setRenderBackend()`, the global `rendering.planar.renderBackend`
configuration, and per-mount `renderBackend` options.

```ts
import {
  registerRenderBackend,
  setRenderBackend,
  Enums,
} from '@cornerstonejs/core';

registerRenderBackend({
  name: 'WEBGPU',
  backend: 'myOrg:webgpu',
  renderModes: {
    image: 'myOrg:webgpuImage',
    volume: 'myOrg:webgpuVolume',
  },
  createRenderPaths: () => [
    new WebGPUImageSlicePath(),
    new WebGPUVolumeSlicePath(),
  ],
});

setRenderBackend(Enums.RenderBackends.WEBGPU);
```

The definition carries the semantic wiring the viewport needs today:

- `backend` — the wire id, e.g. `'myOrg:webgpu'`. Prefix custom ids with an
  organization namespace; `'auto'` is reserved.
- `renderModes` — the render mode the backend resolves to per dataset kind.
  `image` is required; omit `volume` when the backend cannot render
  volume-backed datasets, in which case selecting it for such a dataset fails
  with a descriptive error.
- `createRenderPaths` — a factory returning the planar render path definitions
  that implement those render modes. It is called once per viewport (each
  planar viewport owns its render path resolver), so it must return fresh
  definition instances on every call. See [Render Paths](./render-paths.md)
  for what a path implements.
- `surface` — which existing composited canvas the backend's render modes draw
  to, `'vtk'` (default) or `'cpu'`. Custom backends cannot yet register their
  own surface; this is one of the planned extension points noted above.
- `name` — optional constant name added to `Enums.RenderBackends`, e.g.
  `RenderBackends.WEBGPU`.

## TypeScript Augmentation

The backend string type stays open through two augmentable interfaces in
`@cornerstonejs/core`. Augment them in your extension's `.d.ts` to get the new
wire string and constant name into completions and checks:

```ts
declare module '@cornerstonejs/core' {
  interface RenderBackendRegistry {
    'myOrg:webgpu': 'myOrg:webgpu';
  }
  interface RenderBackendConstants {
    readonly WEBGPU: 'myOrg:webgpu';
  }
}
```

`RenderBackendRegistry` feeds the `RenderBackendValue` string union accepted by
`setRenderBackend()` and `renderBackend` options; `RenderBackendConstants`
types the properties of `Enums.RenderBackends`.
