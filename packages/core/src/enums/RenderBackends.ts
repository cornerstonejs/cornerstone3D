import type {
  CoreRenderBackendConstants,
  RenderBackendConstants,
  RenderBackend as RenderBackendWire,
} from '../types/RenderBackendRegistry';

/**
 * Shape of `Enums.RenderBackends`. Augment {@link RenderBackendConstants} in
 * your extension `.d.ts`; property types on `Enums.RenderBackends` follow that
 * interface.
 */
export type RenderBackendsMap = RenderBackendConstants;

/**
 * String form accepted anywhere a render backend is expected: the built-in
 * `'auto' | 'gpu' | 'cpu'` values plus any backend registered via
 * `registerRenderBackend()` (typed through the augmentable
 * `RenderBackendRegistry` interface).
 */
export type RenderBackendValue = RenderBackendWire;

const builtInRenderBackends: CoreRenderBackendConstants = {
  Auto: 'auto',
  GPU: 'gpu',
  CPU: 'cpu',
};

/**
 * Runtime render backend constants: built-in names map to wire-type strings.
 *
 * Built-ins are available immediately. Extension backends are added when you
 * call `registerRenderBackend({ name: 'WEBGPU', backend: 'myOrg:webgpu', ... })`.
 *
 * For compile-time names, augment `RenderBackendConstants` only —
 * `Enums.RenderBackends` is typed from it.
 */
const RenderBackends = builtInRenderBackends as RenderBackendsMap;

export function registerRenderBackendsConstant<
  Name extends keyof RenderBackendConstants,
>(name: Name, backend: RenderBackendConstants[Name]): void {
  if (Object.prototype.hasOwnProperty.call(RenderBackends, name)) {
    throw new Error(`Render backend constant "${String(name)}" already exists`);
  }

  (RenderBackends as Record<keyof RenderBackendConstants, string>)[name] =
    backend;
}

export default RenderBackends;
