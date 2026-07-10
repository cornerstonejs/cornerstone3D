import RenderBackends, {
  registerRenderBackendsConstant,
} from '../../enums/RenderBackends';
import { ActorRenderMode } from '../../types/IActor';
import type {
  EffectiveRenderBackend,
  RenderBackend as RenderBackendWire,
  RenderBackendConstants,
} from '../../types/RenderBackendRegistry';
import type { RenderPathDefinition } from '../GenericViewport/ViewportArchitectureTypes';

/**
 * The composited canvas a render mode draws to inside a planar
 * GenericViewport. The viewport owns one canvas per surface and toggles their
 * visibility when the active render mode changes; custom backends draw to one
 * of the existing surfaces.
 */
export type RenderSurface = 'vtk' | 'cpu';

/** The dataset shapes a planar render backend can mount. */
export type RenderBackendDataKind = 'image' | 'volume';

export interface RenderBackendRenderMode {
  /** Wire id of the render mode, e.g. 'myOrg:webgpuImage'. */
  id: string;
  /**
   * Planar render path definition implementing this render mode. Called once
   * per viewport (each PlanarViewport owns its resolver), so it must return a
   * fresh definition instance on every call. Core backends omit it: their
   * render paths ship in createDefaultPlanarRenderPaths().
   */
  createDefinition?: () => RenderPathDefinition;
}

export interface RenderBackendRenderModes {
  /** Render mode selected for image-stack (non-volume-backed) mounts. */
  image: RenderBackendRenderMode;
  /**
   * Render mode selected for volume-backed mounts. Omit when the backend
   * cannot render volume-backed datasets; selecting the backend for such a
   * dataset then fails with a descriptive error.
   */
  volume?: RenderBackendRenderMode;
}

export interface RenderBackendDefinition {
  /** Wire id of the backend, e.g. 'gpu' or 'myOrg:webgpu'. 'auto' is reserved. */
  backend: string;
  /**
   * Render modes this backend resolves to, by dataset kind. Each mode
   * co-locates its wire id with the render path definition implementing it.
   */
  renderModes: RenderBackendRenderModes;
  /** Composited canvas the backend's render modes draw to. Default 'vtk'. */
  surface?: RenderSurface;
}

type RegisterRenderBackendNamedOptions<
  Name extends keyof RenderBackendConstants,
> = RenderBackendDefinition & {
  /** Constant name added on `Enums.RenderBackends`, e.g. 'WEBGPU'. */
  name: Name;
  backend: RenderBackendConstants[Name];
};

type RegisterRenderBackendUnnamedOptions = RenderBackendDefinition & {
  backend: RenderBackendWire | string;
  name?: never;
};

export type RegisterRenderBackendOptions =
  | RegisterRenderBackendNamedOptions<keyof RenderBackendConstants>
  | RegisterRenderBackendUnnamedOptions;

interface RenderModeEntry {
  backend: EffectiveRenderBackend;
  kind: RenderBackendDataKind;
  surface: RenderSurface;
}

type InternalRenderBackendDefinition = RenderBackendDefinition & {
  surface: RenderSurface;
};

const backendDefinitions = new Map<string, InternalRenderBackendDefinition>();
const renderModeIndex = new Map<string, RenderModeEntry>();
const registeredConstantNames: Array<keyof RenderBackendConstants> = [];
let hasRegisteredCoreRenderBackends = false;

function registerCoreRenderBackends() {
  if (hasRegisteredCoreRenderBackends) {
    return;
  }
  hasRegisteredCoreRenderBackends = true;

  // Core render modes carry no createDefinition: their planar render paths
  // are part of createDefaultPlanarRenderPaths() and are always present.
  registerRenderBackend({
    backend: RenderBackends.GPU,
    renderModes: {
      image: { id: ActorRenderMode.VTK_IMAGE },
      volume: { id: ActorRenderMode.VTK_VOLUME_SLICE },
    },
    surface: 'vtk',
  });
  registerRenderBackend({
    backend: RenderBackends.CPU,
    renderModes: {
      image: { id: ActorRenderMode.CPU_IMAGE },
      volume: { id: ActorRenderMode.CPU_VOLUME },
    },
    surface: 'cpu',
  });
}

/**
 * Registers a render backend for planar GenericViewports, following the same
 * extensible-enum model as `registerViewportType`: the backend id becomes a
 * valid value for `setRenderBackend()`, the global
 * `rendering.planar.renderBackend` configuration and per-mount `renderBackend`
 * options, and — when `name` is given — a constant on `Enums.RenderBackends`.
 *
 * The definition carries the semantic wiring the viewport needs:
 * - `renderModes` tells the planar render-path decision which render mode to
 *   select for image-stack vs volume-backed datasets. Each mode co-locates
 *   its wire id with the `createDefinition` factory that injects the render
 *   path implementing it into every planar viewport's render path resolver.
 * - `surface` tells the viewport which composited canvas to show while one of
 *   the backend's modes is active.
 *
 * For compile-time typing, augment the `RenderBackendRegistry` (wire strings)
 * and `RenderBackendConstants` (constant names) interfaces in your extension's
 * `.d.ts`.
 *
 * @experimental Custom backends are not fully functional yet, and this
 * registration API is intentionally incomplete: the definition is intended to
 * grow additional parameters describing the backend-specific changes and
 * behaviours being registered (participation in the 'auto' capability
 * resolution, backend-owned surface/canvas creation, per-backend degradation
 * handling). Expect `RegisterRenderBackendOptions` to change.
 *
 * @example
 * ```ts
 * registerRenderBackend({
 *   name: 'WEBGPU',
 *   backend: 'myOrg:webgpu',
 *   renderModes: {
 *     image: {
 *       id: 'myOrg:webgpuImage',
 *       createDefinition: () => new WebGPUImageSlicePath(),
 *     },
 *     volume: {
 *       id: 'myOrg:webgpuVolume',
 *       createDefinition: () => new WebGPUVolumeSlicePath(),
 *     },
 *   },
 * });
 * setRenderBackend(RenderBackends.WEBGPU);
 * ```
 */
export function registerRenderBackend<
  Name extends keyof RenderBackendConstants,
>(options: RegisterRenderBackendNamedOptions<Name>): void;
export function registerRenderBackend(
  options: RegisterRenderBackendUnnamedOptions
): void;
export function registerRenderBackend({
  backend,
  name,
  renderModes,
  surface = 'vtk',
}: RegisterRenderBackendOptions): void {
  registerCoreRenderBackends();

  if (backend === RenderBackends.Auto) {
    throw new Error(
      `Render backend id "${RenderBackends.Auto}" is reserved for the automatic backend resolution`
    );
  }

  if (backendDefinitions.has(backend)) {
    throw new Error(`Render backend "${backend}" is already registered`);
  }

  if (!renderModes?.image?.id) {
    throw new Error(
      `Render backend "${backend}" must declare renderModes.image`
    );
  }

  if (renderModes.volume && renderModes.volume.id === renderModes.image.id) {
    throw new Error(
      `Render backend "${backend}" must use distinct render modes for image and volume`
    );
  }

  const modeEntries: Array<[string, RenderBackendDataKind]> = [
    [renderModes.image.id, 'image'],
  ];

  if (renderModes.volume) {
    modeEntries.push([renderModes.volume.id, 'volume']);
  }

  for (const [renderMode] of modeEntries) {
    const existing = renderModeIndex.get(renderMode);
    if (existing && existing.backend !== backend) {
      throw new Error(
        `Render mode "${renderMode}" is already provided by render backend "${existing.backend}"`
      );
    }
  }

  if (name && Object.prototype.hasOwnProperty.call(RenderBackends, name)) {
    throw new Error(`Render backend constant "${String(name)}" already exists`);
  }

  backendDefinitions.set(backend, {
    backend,
    renderModes,
    surface,
  });

  for (const [renderMode, kind] of modeEntries) {
    renderModeIndex.set(renderMode, {
      backend: backend as EffectiveRenderBackend,
      kind,
      surface,
    });
  }

  if (name) {
    registerRenderBackendsConstant(
      name,
      backend as RenderBackendConstants[typeof name]
    );
    registeredConstantNames.push(name);
  }
}

/**
 * Whether `backend` names a registered concrete render backend. The 'auto'
 * preference is not a concrete backend and returns false; validate it
 * separately where a preference (rather than a resolved backend) is accepted.
 */
export function isRegisteredRenderBackend(backend: string): boolean {
  registerCoreRenderBackends();
  return backendDefinitions.has(backend);
}

export function getRenderBackendDefinition(
  backend: string
): Readonly<RenderBackendDefinition> | undefined {
  registerCoreRenderBackends();
  return backendDefinitions.get(backend);
}

/**
 * Render mode a backend resolves to for the given dataset kind. Throws a
 * descriptive error when the backend is unknown or does not support the kind
 * (e.g. an image-only backend asked to mount a volume-backed dataset).
 */
export function getRenderModeForBackend(
  backend: string,
  kind: RenderBackendDataKind
): string {
  const definition = getRenderBackendDefinition(backend);

  if (!definition) {
    throw new Error(
      `Unknown render backend "${backend}". Register it with registerRenderBackend() first.`
    );
  }

  const renderMode = definition.renderModes[kind];

  if (!renderMode) {
    throw new Error(
      `Render backend "${backend}" does not support ${kind}-backed rendering`
    );
  }

  return renderMode.id;
}

/** Backend that provides `renderMode`, or undefined for unknown modes. */
export function getRenderBackendForRenderMode(
  renderMode: string | undefined
): EffectiveRenderBackend | undefined {
  registerCoreRenderBackends();
  return renderMode ? renderModeIndex.get(renderMode)?.backend : undefined;
}

/** Whether `renderMode` is a registered backend's volume render mode. */
export function isVolumeRenderMode(renderMode: string | undefined): boolean {
  registerCoreRenderBackends();
  return renderMode
    ? renderModeIndex.get(renderMode)?.kind === 'volume'
    : false;
}

/** Whether `renderMode` is a registered backend's image render mode. */
export function isImageRenderMode(renderMode: string | undefined): boolean {
  registerCoreRenderBackends();
  return renderMode ? renderModeIndex.get(renderMode)?.kind === 'image' : false;
}

/**
 * Composited canvas the given render mode draws to. Unknown modes default to
 * the 'vtk' surface.
 */
export function getRenderSurfaceForRenderMode(
  renderMode: string | undefined
): RenderSurface {
  registerCoreRenderBackends();
  return (renderMode && renderModeIndex.get(renderMode)?.surface) || 'vtk';
}

/**
 * Instantiates the planar render path definitions of every registered
 * extension backend's render modes (core backends ship their paths in
 * `createDefaultPlanarRenderPaths`). Called once per planar viewport.
 */
export function createRegisteredPlanarRenderPaths(): RenderPathDefinition[] {
  registerCoreRenderBackends();

  const paths: RenderPathDefinition[] = [];

  for (const definition of backendDefinitions.values()) {
    const { image, volume } = definition.renderModes;
    for (const mode of [image, volume]) {
      if (mode?.createDefinition) {
        paths.push(mode.createDefinition());
      }
    }
  }

  return paths;
}

/**
 * Test-only: wipes all backend registrations (including the lazily registered
 * core backends) and removes the `Enums.RenderBackends` constants added
 * through `registerRenderBackend()`. Not part of the public API — import it
 * from this module directly in test setup/teardown.
 * @internal
 */
export function __resetRenderBackendRegistry(): void {
  backendDefinitions.clear();
  renderModeIndex.clear();
  hasRegisteredCoreRenderBackends = false;

  for (const name of registeredConstantNames) {
    delete (RenderBackends as Record<keyof RenderBackendConstants, string>)[
      name
    ];
  }
  registeredConstantNames.length = 0;
}
