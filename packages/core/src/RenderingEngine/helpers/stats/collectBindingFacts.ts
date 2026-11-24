import { PlanarRenderModeId } from '../../Viewports/Planar/planarRenderModeIds';
import type { RenderingCapabilities } from '../../../utilities/renderingCapabilities';
import { getImageMapperTextureFacts } from '../../vtkClasses/vtkStreamingOpenGLImageMapper';
import type {
  RenderModePanelBinding,
  RenderModePanelEntry,
  RenderModePanelSummary,
  RenderModePanelTexture,
} from './RenderModesPanel';

/**
 * The structural view of a mounted rendering that the stats overlay reads.
 * Every member is optional, so a rendering of any render path fits.
 */
export type DebugRendering = {
  renderMode?: string;
  actor?: DebugImageActor;
  mapper?: DebugImageMapper;
  imageVolume?: { volumeId?: string };
  getSliceCacheStatistics?: () => DebugSliceCacheStatistics | undefined;
};

/** One display set of a viewport, as `BaseViewport.getDebugBindings` gives it. */
export type DebugBinding = {
  displaySetId: string;
  role?: string;
  rendering?: DebugRendering;
  renderings?: ReadonlyArray<DebugRendering>;
};

/** A viewport that can list its display sets for the stats overlay. */
export type DebugBindingsSource = {
  getDebugBindings?: () => ReadonlyArray<DebugBinding>;
  getRenderPlan?: () => ReadonlyArray<{
    displaySetId: string;
    reason?: string;
  }>;
};

type DebugSliceCacheStatistics = {
  hits?: number;
  misses?: number;
  prefetched?: number;
  size?: number;
  lastSampleMs?: number;
  lastFineSampleMs?: number;
};

type DebugImageMapper = {
  getInputData?: () => DebugImageData | null | undefined;
};

type DebugImageActor = {
  getMapper?: () => DebugImageMapper | null | undefined;
};

type DebugImageData = {
  getDimensions?: () => number[];
  getPointData?: () =>
    | {
        getScalars?: () =>
          | {
              getDataType?: () => string;
              getNumberOfComponents?: () => number;
              getData?: () => { BYTES_PER_ELEMENT?: number } | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
};

/** The facts of one binding that the overlay adds to its row. */
export type BindingFacts = Pick<
  RenderModePanelBinding,
  | 'sliceSize'
  | 'sampleMs'
  | 'fineSampleMs'
  | 'sliceCache'
  | 'gpuTextures'
  | 'reason'
>;

const SLICE_TEXTURE_MODES = new Set<string>([
  PlanarRenderModeId.VTK_FRAME,
  PlanarRenderModeId.VTK_CPU_SLICE,
]);

const CANVAS_MODES = new Set<string>([
  PlanarRenderModeId.CANVAS_FRAME,
  PlanarRenderModeId.CANVAS_CPU_SLICE,
]);

/**
 * Reads, for each display set of a viewport, what the overlay shows next to
 * its render mode: the size of a sampled slice, the times and the cache
 * counts of the sampler, and the textures that the binding holds on the GPU.
 * A binding drawn by an image mapper holds a 2D texture of the image of its
 * mapper. A binding drawn from a volume holds the 3D textures of that volume,
 * whose bytes `getVolumeTextureBytes` gives. A binding drawn on a 2D canvas
 * holds no texture. A viewport with a render plan also gives the reason of
 * the render mode of each display set. Returns the facts by display set id,
 * and never throws.
 */
export function collectBindingFacts(
  viewport: DebugBindingsSource,
  getVolumeTextureBytes: (volumeId: string) => number
): Map<string, BindingFacts> {
  const factsById = new Map<string, BindingFacts>();
  const reasonById = readRenderPlanReasons(viewport);
  let bindings: ReadonlyArray<DebugBinding> = [];

  try {
    bindings = viewport.getDebugBindings?.() ?? [];
  } catch {
    return factsById;
  }

  for (const binding of bindings) {
    const reason = reasonById.get(binding.displaySetId);

    try {
      factsById.set(binding.displaySetId, {
        ...readBindingFacts(binding, getVolumeTextureBytes),
        ...(reason ? { reason } : {}),
      });
    } catch {
      factsById.set(binding.displaySetId, reason ? { reason } : {});
    }
  }

  return factsById;
}

/** The reason of each layer of the render plan of a viewport, by display set id. */
function readRenderPlanReasons(
  viewport: DebugBindingsSource
): Map<string, string> {
  const reasonById = new Map<string, string>();

  try {
    for (const layer of viewport.getRenderPlan?.() ?? []) {
      if (layer.reason) {
        reasonById.set(layer.displaySetId, layer.reason);
      }
    }
  } catch {
    return reasonById;
  }

  return reasonById;
}

/**
 * Marks each 3D texture with the number of viewports that draw the same
 * volume, so a reader sees which memory is shared and not counted twice.
 */
export function markSharedVolumeTextures(
  entries: RenderModePanelEntry[]
): void {
  const viewportsByVolumeId = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const texture of volumeTexturesOf(entry)) {
      const viewports = viewportsByVolumeId.get(texture.volumeId) ?? new Set();

      viewports.add(`${entry.renderingEngineId}/${entry.viewportId}`);
      viewportsByVolumeId.set(texture.volumeId, viewports);
    }
  }

  for (const entry of entries) {
    for (const texture of volumeTexturesOf(entry)) {
      texture.sharedBy = viewportsByVolumeId.get(texture.volumeId).size;
    }
  }
}

/**
 * Sums the GPU texture memory: the 3D textures of every volume as the
 * texture store counts them (each volume once, whoever draws it), and the
 * 2D textures of every binding that an image mapper draws. With a capability
 * profile, the summary also names the limits of the device that change a
 * render path decision (see {@link getDeviceLimits}).
 */
export function summarizeTextureMemory(
  entries: RenderModePanelEntry[],
  volumeTextureBytes: number,
  capabilities?: Pick<RenderingCapabilities, 'webgl' | 'floatLinear'>
): RenderModePanelSummary {
  let sliceTextureBytes = 0;
  let sliceTexturesApproximate = false;

  for (const entry of entries) {
    for (const binding of entry.bindings) {
      for (const texture of binding.gpuTextures ?? []) {
        if (texture.kind === 'slice') {
          sliceTextureBytes += texture.bytes;
          sliceTexturesApproximate ||= Boolean(texture.approximate);
        }
      }
    }
  }

  const deviceLimits = capabilities ? getDeviceLimits(capabilities) : [];

  return {
    volumeTextureBytes,
    sliceTextureBytes,
    sliceTexturesApproximate,
    ...(deviceLimits.length ? { deviceLimits } : {}),
  };
}

/**
 * The limits of the device, from its capability profile, that change a
 * render path decision, in a few words each: a GPU that cannot filter float
 * textures keeps float layers off the GPU volume path.
 */
export function getDeviceLimits(
  capabilities: Pick<RenderingCapabilities, 'webgl' | 'floatLinear'>
): string[] {
  return capabilities.webgl && !capabilities.floatLinear
    ? ['float textures: no linear filtering']
    : [];
}

function volumeTexturesOf(
  entry: RenderModePanelEntry
): Array<RenderModePanelTexture & { volumeId: string }> {
  const textures: Array<RenderModePanelTexture & { volumeId: string }> = [];

  for (const binding of entry.bindings) {
    for (const texture of binding.gpuTextures ?? []) {
      if (texture.kind === 'volume' && texture.volumeId) {
        textures.push(texture as RenderModePanelTexture & { volumeId: string });
      }
    }
  }

  return textures;
}

function readBindingFacts(
  binding: DebugBinding,
  getVolumeTextureBytes: (volumeId: string) => number
): BindingFacts {
  const rendering = binding.rendering;
  const renderings = binding.renderings?.length
    ? binding.renderings
    : rendering
      ? [rendering]
      : [];
  const facts: BindingFacts = {};
  const statistics = rendering?.getSliceCacheStatistics?.();

  if (statistics) {
    facts.sampleMs = statistics.lastSampleMs;
    facts.fineSampleMs = statistics.lastFineSampleMs;
    facts.sliceCache = {
      size: statistics.size ?? 0,
      hits: statistics.hits ?? 0,
      misses: statistics.misses ?? 0,
      prefetched: statistics.prefetched ?? 0,
    };
  }

  if (rendering?.renderMode === PlanarRenderModeId.VTK_CPU_SLICE) {
    const dimensions = readImageData(rendering)?.getDimensions?.();

    if (dimensions && dimensions.length >= 2) {
      facts.sliceSize = [dimensions[0], dimensions[1]];
    }
  }

  const textures: RenderModePanelTexture[] = [];
  const volumeIds = new Set<string>();

  for (const each of renderings) {
    const texture = readTexture(each, getVolumeTextureBytes);

    if (!texture) {
      continue;
    }

    if (texture.kind === 'volume') {
      if (volumeIds.has(texture.volumeId)) {
        continue;
      }

      volumeIds.add(texture.volumeId);
    }

    textures.push(texture);
  }

  if (textures.length) {
    facts.gpuTextures = textures;
  }

  return facts;
}

function readTexture(
  rendering: DebugRendering,
  getVolumeTextureBytes: (volumeId: string) => number
): RenderModePanelTexture | undefined {
  const renderMode = rendering.renderMode;

  if (!renderMode) {
    return undefined;
  }

  if (CANVAS_MODES.has(renderMode)) {
    return { kind: 'canvas', bytes: 0 };
  }

  if (SLICE_TEXTURE_MODES.has(renderMode)) {
    return readSliceTexture(rendering);
  }

  const volumeId = rendering.imageVolume?.volumeId;

  if (!volumeId) {
    return undefined;
  }

  return {
    kind: 'volume',
    bytes: getVolumeTextureBytes(volumeId),
    volumeId,
  };
}

/**
 * Reads the 2D texture of an image mapper: width x height x the bytes of one
 * value of the uploaded array x its components. The GPU can keep another
 * format than the array (a 16-bit or float array can be held as 16 or 32 bit
 * floats), so only an 8-bit array gives an exact count. When the device holds
 * the slice in a way that is not the default, the texture also says how:
 * a half float texture, or nearest filtering of a float texture that this
 * device cannot filter.
 */
function readSliceTexture(
  rendering: DebugRendering
): RenderModePanelTexture | undefined {
  const imageData = readImageData(rendering);
  const dimensions = imageData?.getDimensions?.();
  const scalars = imageData?.getPointData?.()?.getScalars?.();

  if (!dimensions?.length || !scalars) {
    return undefined;
  }

  const width = dimensions[0] ?? 1;
  const height = dimensions[1] ?? 1;
  const depth = dimensions[2] ?? 1;
  const bytesPerValue = scalars.getData?.()?.BYTES_PER_ELEMENT ?? 1;
  const components = scalars.getNumberOfComponents?.() ?? 1;

  return {
    kind: 'slice',
    bytes: width * height * depth * bytesPerValue * components,
    dimensions: [width, height],
    scalarType: scalars.getDataType?.(),
    approximate: bytesPerValue !== 1,
    ...readDeviceTexture(rendering),
  };
}

/**
 * The format and filter of the 2D texture of a rendering when they are not
 * the default (see `getImageMapperTextureFacts`): a half float texture, or a
 * float texture sampled with nearest filtering because the device cannot
 * filter it. Empty otherwise.
 */
function readDeviceTexture(
  rendering: DebugRendering
): Pick<RenderModePanelTexture, 'textureFormat' | 'filter'> {
  const facts = getImageMapperTextureFacts(
    rendering.mapper ?? rendering.actor?.getMapper?.()
  );

  if (
    !facts ||
    (facts.textureFormat !== 'R16F' &&
      !(facts.filter === 'nearest' && facts.nearestForFloat))
  ) {
    return {};
  }

  return { textureFormat: facts.textureFormat, filter: facts.filter };
}

function readImageData(rendering: DebugRendering): DebugImageData | undefined {
  return (
    rendering.mapper?.getInputData?.() ??
    rendering.actor?.getMapper?.()?.getInputData?.() ??
    undefined
  );
}
