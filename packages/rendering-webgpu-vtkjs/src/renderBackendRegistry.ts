/**
 * Compile-time registration of the `'webgpu'` backend id.
 *
 * The backend registry is an extensible enum: core declares `auto`/`gpu`/`cpu`
 * and extensions augment these interfaces from their own package, which is
 * what makes `setRenderBackend('webgpu')` and `Enums.RenderBackends.WEBGPU`
 * type-check for consumers of this package without core knowing about WebGPU
 * at all.
 *
 * Importing this package is what brings the augmentation into scope. The
 * runtime entry appears only after `registerWebGPURenderBackend()` runs, so a
 * value being typed here is not a promise that it is registered — guard with
 * `isRegisteredRenderBackend('webgpu')` or `isWebGPURenderingAvailable()`.
 */
// This file must be a module for the block below to *augment* core's
// interfaces rather than shadow the whole module with a new declaration.
export {};

declare module '@cornerstonejs/core/types/RenderBackendRegistry' {
  interface RenderBackendRegistry {
    /** Experimental vtk.js WebGPU backend. @deprecated See #2894. */
    webgpu: 'webgpu';
  }

  interface RenderBackendConstants {
    /** Experimental vtk.js WebGPU backend. @deprecated See #2894. */
    readonly WEBGPU: 'webgpu';
  }
}
