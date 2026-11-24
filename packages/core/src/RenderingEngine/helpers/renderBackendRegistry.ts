import RenderBackends, {
  registerRenderBackendsConstant,
} from '../../enums/RenderBackends';
import { PlanarRenderModeId } from '../Viewports/Planar/planarRenderModeIds';
import type {
  EffectiveRenderBackend,
  RenderBackend as RenderBackendWire,
  RenderBackendConstants,
} from '../../types/RenderBackendRegistry';
import type { RenderPathDefinition } from '../Viewports/ViewportArchitectureTypes';
import type { RenderPlanSlice } from '../Viewports/Planar/PlanarViewportTypes';

/**
 * The composited canvas a render mode draws to inside a planar
 * BaseViewport. The viewport owns one canvas per surface and toggles their
 * visibility when the active render mode changes; custom backends draw to one
 * of the existing surfaces.
 */
export type RenderSurface = 'vtk' | 'cpu';

export interface RenderBackendRenderMode {
  /** Wire id of the render mode, e.g. 'myOrg:webgpuFrame'. */
  id: string;
  /**
   * Planar render path definition implementing this render mode. Called once
   * per viewport (each PlanarViewport owns its resolver), so it must return a
   * fresh definition instance on every call. Core backends omit it: their
   * render paths ship in createDefaultPlanarRenderPaths().
   */
  createDefinition?: () => RenderPathDefinition;
}

/**
 * The render modes of a backend, one for each way of making the slice. The
 * slot names are the values of `RenderPlanLayer.slice`: a layer drawn by the
 * mode of a slot has that `slice` in `viewport.getRenderPlan()`.
 */
export interface RenderBackendRenderModes {
  /**
   * The acquired frame is the image. The decision selects it for a mount
   * that is not volume-backed (a stack).
   */
  frame: RenderBackendRenderMode;
  /**
   * The CPU cuts the slice out of the volume and the mode draws it as a 2D
   * image (no 3D texture). The planar render path decision selects it for a
   * volume-backed mount when slice first is on and the view allows it, and
   * always when the backend has no `gpuVolume` mode. Omit it when the backend
   * cannot draw such a slice.
   */
  cpu?: RenderBackendRenderMode;
  /**
   * The GPU cuts the slice (or the slab) out of a 3D texture of the volume.
   * The decision selects it for a volume-backed mount that the `cpu` mode
   * does not take, and always when the backend has no `cpu` mode. A backend
   * with neither cannot mount a volume-backed display set: selecting it for
   * one fails with a descriptive error.
   */
  gpuVolume?: RenderBackendRenderMode;
}

export interface RenderBackendDefinition {
  /** Wire id of the backend, e.g. 'gpu' or 'myOrg:webgpu'. 'auto' is reserved. */
  backend: string;
  /**
   * Render modes this backend resolves to, by the way the slice is made.
   * Each mode co-locates its wire id with the render path definition
   * implementing it.
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
  slice: RenderPlanSlice;
  surface: RenderSurface;
}

const renderPlanSlices: RenderPlanSlice[] = ['frame', 'cpu', 'gpuVolume'];

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
      frame: { id: PlanarRenderModeId.VTK_FRAME },
      cpu: { id: PlanarRenderModeId.VTK_CPU_SLICE },
      gpuVolume: { id: PlanarRenderModeId.VTK_GPU_VOLUME_SLICE },
    },
    surface: 'vtk',
  });
  registerRenderBackend({
    backend: RenderBackends.CPU,
    renderModes: {
      frame: { id: PlanarRenderModeId.CANVAS_FRAME },
      cpu: { id: PlanarRenderModeId.CANVAS_CPU_SLICE },
    },
    surface: 'cpu',
  });
}

/**
 * Registers a render backend for planar viewports, following the same
 * extensible-enum model as `registerViewportType`: the backend id becomes a
 * valid value for `setRenderBackend()`, the global
 * `rendering.planar.renderBackend` configuration and per-mount `renderBackend`
 * options, and — when `name` is given — a constant on `Enums.RenderBackends`.
 *
 * The definition carries the semantic wiring the viewport needs:
 * - `renderModes` tells the planar render-path decision which render mode to
 *   select for each way of making the slice: `frame` (a stack, or the
 *   acquired frame), `cpu` (a slice cut on the CPU) and `gpuVolume` (a slice
 *   or slab cut on the GPU from a 3D texture). The slot of the mode a layer
 *   uses is the `slice` of its entry in `viewport.getRenderPlan()`. Each mode
 *   co-locates its wire id with the `createDefinition` factory that injects
 *   the render path implementing it into every planar viewport's render path
 *   resolver.
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
 *     frame: {
 *       id: 'myOrg:webgpuFrame',
 *       createDefinition: () => new WebGPUFramePath(),
 *     },
 *     gpuVolume: {
 *       id: 'myOrg:webgpuVolumeSlice',
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

  if (!renderModes?.frame?.id) {
    throw new Error(
      `Render backend "${backend}" must declare renderModes.frame`
    );
  }

  const modeEntries: Array<[string, RenderPlanSlice]> = [];

  for (const slice of renderPlanSlices) {
    const mode = renderModes[slice];

    if (mode) {
      modeEntries.push([mode.id, slice]);
    }
  }

  if (
    new Set(modeEntries.map(([renderMode]) => renderMode)).size !==
    modeEntries.length
  ) {
    throw new Error(
      `Render backend "${backend}" must use distinct render modes for frame, cpu and gpuVolume`
    );
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

  for (const [renderMode, slice] of modeEntries) {
    renderModeIndex.set(renderMode, {
      backend: backend as EffectiveRenderBackend,
      slice,
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
 * Render mode of the slot `slice` of a backend, or undefined when the
 * backend has no mode in that slot. Throws a descriptive error when the
 * backend is unknown.
 */
export function getRenderModeForBackend(
  backend: string,
  slice: RenderPlanSlice
): string | undefined {
  const definition = getRenderBackendDefinition(backend);

  if (!definition) {
    throw new Error(
      `Unknown render backend "${backend}". Register it with registerRenderBackend() first.`
    );
  }

  return definition.renderModes[slice]?.id;
}

/** Backend that provides `renderMode`, or undefined for unknown modes. */
export function getRenderBackendForRenderMode(
  renderMode: string | undefined
): EffectiveRenderBackend | undefined {
  registerCoreRenderBackends();
  return renderMode ? renderModeIndex.get(renderMode)?.backend : undefined;
}

/**
 * The slot of a registered backend that provides `renderMode`: how a layer
 * drawn with it makes its slice (`RenderPlanLayer.slice`). Undefined for
 * unknown modes.
 */
export function getRenderPlanSliceForRenderMode(
  renderMode: string | undefined
): RenderPlanSlice | undefined {
  registerCoreRenderBackends();
  return renderMode ? renderModeIndex.get(renderMode)?.slice : undefined;
}

/**
 * Whether `renderMode` is a registered backend's volume render mode: the mode
 * of its `cpu` or `gpuVolume` slot.
 */
export function isVolumeRenderMode(renderMode: string | undefined): boolean {
  const slice = getRenderPlanSliceForRenderMode(renderMode);

  return slice === 'cpu' || slice === 'gpuVolume';
}

/** Whether `renderMode` is a registered backend's `frame` render mode. */
export function isImageRenderMode(renderMode: string | undefined): boolean {
  return getRenderPlanSliceForRenderMode(renderMode) === 'frame';
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
    for (const slice of renderPlanSlices) {
      const mode = definition.renderModes[slice];

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
