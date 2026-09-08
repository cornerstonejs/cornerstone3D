# @cornerstonejs/rendering-webgpu-vtkjs

Experimental WebGPU render backend for Cornerstone3D planar viewports, built on
the vtk.js WebGPU view API. Covers image stacks and volume-slice (MPR)
rendering.

> [!WARNING]
> **Deprecated on arrival — maintained, not developed.**
>
> vtk.js's WebGPU support is not being completed upstream; the supported route
> to WebGPU is vtk-wasm, tracked in
> [#2894](https://github.com/cornerstonejs/cornerstone3D/issues/2894). This
> package exists so the WebGPU work from
> [#2796](https://github.com/cornerstonejs/cornerstone3D/pull/2796) stays
> available for evaluation and comparison rather than being deleted. It is not
> installed by default and is not part of any Cornerstone3D bundle unless your
> application asks for it.
>
> Use it to measure WebGPU against the WebGL path. Do not build new work on it.

## Why it is a separate package

Nothing in `@cornerstonejs/core` references it. It reaches core only through
public API — `@cornerstonejs/core/renderBackend` (the render-backend authoring
SDK) plus the ordinary `enums` / `types` / `utilities` / `loaders` subpaths — so
an application that never imports it pays nothing for it, and core carries no
WebGPU code, types, or registry entries.

## Install

```sh
npm install @cornerstonejs/rendering-webgpu-vtkjs
```

Requires `@kitware/vtk.js` 36.4.2 or later, which contains the two upstream
fixes this backend depends on:
[Kitware/vtk-js#3547](https://github.com/Kitware/vtk-js/pull/3547) (ImageMapper
projection and imageData texture invalidation) and
[Kitware/vtk-js#3548](https://github.com/Kitware/vtk-js/pull/3548)
(translucent-pass depth for coplanar overlays, needed for labelmap
segmentation).

## Use

Load it dynamically so it stays out of your main bundle — it is an opt-in
renderer, and a static import defeats the point of it being a separate package:

```ts
import { setRenderBackend } from '@cornerstonejs/core';

async function enableWebGPU(): Promise<boolean> {
  if (!navigator.gpu) {
    return false;
  }

  const { isWebGPURenderingAvailable, registerWebGPURenderBackend } =
    await import('@cornerstonejs/rendering-webgpu-vtkjs');

  if (!isWebGPURenderingAvailable()) {
    return false;
  }

  registerWebGPURenderBackend();
  setRenderBackend('webgpu');

  return true;
}
```

After registration the backend behaves like any other:

- globally, `setRenderBackend('webgpu')` (or `Enums.RenderBackends.WEBGPU`,
  which this package's type augmentation adds);
- per display set, `options: { renderBackend: 'webgpu' }`.

`registerWebGPURenderBackend()` throws when WebGPU is unavailable, so check
`isWebGPURenderingAvailable()` first — or keep the `navigator.gpu` guard above
the dynamic import, which also avoids downloading the module on browsers that
cannot use it.

## What it renders

| Kind               | Render mode    | Status                                    |
| ------------------ | -------------- | ----------------------------------------- |
| Image stack        | `webgpuImage`  | Working, pixel parity with WebGL verified |
| Volume slice (MPR) | `webgpuVolume` | Working, including oblique                |
| 3D volume (DVR)    | —              | Not implemented                           |

Annotations and labelmap segmentation composite correctly on both modes.

The backend blits its frames into the viewport's `cpu` surface canvas after the
device work completes, because the `vtk` surface belongs to the rendering
engine's WebGL blit cycle. That is a statement about which canvas is
composited, not about how the scene is built — the actors are ordinary vtk
actors, which is why both render modes declare `usesVtkActors` and
`supportsOverlayActors`. Backend-owned surfaces would remove the blit; see
[#2894](https://github.com/cornerstonejs/cornerstone3D/issues/2894).

## Examples

Three examples in this repository drive the backend through this package's
public entry point, and are the quickest way to see the separation working:

| Example               | What it shows                                                         |
| --------------------- | --------------------------------------------------------------------- |
| `genericWebGPUStack`  | Image stack, live `webgpu`/`gpu`/`cpu` switching, tools, a labelmap   |
| `genericWebGPUOrtho`  | Sagittal and coronal CT MPR on the volume-slice render mode           |
| `genericWebGPUPetMIP` | Rotating PET MIP beside a CT-Bone 3D volume, `webgpu`/`gpu` switching |

They live in `packages/core/examples/` alongside the other GenericViewport
examples so their URLs are unchanged, but they import
`registerWebGPURenderBackend` and friends from this package rather than from
core. Run them with `pnpm run dev`.

They import this package statically, because each drives it from synchronous
callbacks (the backend switcher and the debug panel) and the static form keeps
them readable as examples. That is not the recommendation above: an application
should use the dynamic import so the backend never reaches a bundle it is not
wanted in. Even statically imported, the bundler emits the backend as its own
chunk here, which is the separation this package exists to demonstrate.

## Limitations

- **Planar only.** No 3D volume rendering.
- **One WebGPU render window per viewport**, ref-counted and shared across the
  bindings on that viewport.
- **Volume rendering materializes one shared, ref-counted contiguous scalar
  array per volume**, because Cornerstone volumes are image-backed and own no
  contiguous array. JS heap holds a single copy regardless of viewport count.
  The multi-resolution voxel manager is where this should eventually be
  answered instead.
