export interface CoreRenderBackendRegistry {
  auto: 'auto';
  gpu: 'gpu';
  cpu: 'cpu';
}

export interface CoreRenderBackendConstants {
  readonly Auto: 'auto';
  readonly GPU: 'gpu';
  readonly CPU: 'cpu';
}

/**
 * Extensions can augment this interface to add additional runtime render
 * backend strings, e.g.
 * `interface RenderBackendRegistry { 'myOrg:webgpu': 'myOrg:webgpu' }`.
 */
export interface RenderBackendRegistry extends CoreRenderBackendRegistry {}

/**
 * Extensions augment this interface to add names on `Enums.RenderBackends`.
 * `RenderBackendsMap` and the runtime `Enums.RenderBackends` object are typed
 * from this interface — update it once, e.g.:
 *
 * `interface RenderBackendConstants { readonly WEBGPU: 'myOrg:webgpu' }`
 */
export interface RenderBackendConstants extends CoreRenderBackendConstants {}

export type RenderBackend = RenderBackendRegistry[keyof RenderBackendRegistry];

/**
 * A concrete (resolved) render backend: any registered backend except the
 * 'auto' preference, which always resolves to one of these.
 */
export type EffectiveRenderBackend = Exclude<RenderBackend, 'auto'>;
