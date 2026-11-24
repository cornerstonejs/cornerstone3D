/**
 * What one entry of the GPU memory ledger holds.
 *
 * - `texture`: one upload of a texture to a WebGL context.
 * - `canvas`: the on-screen canvas of a viewport.
 * - `renderBuffer`: the color and depth buffers of the offscreen canvas of one
 *   WebGL context.
 * - `context`: the fixed cost of one vtk.js WebGL context (shaders, buffers,
 *   lookup tables), as an estimate.
 */
export type GpuMemoryKind = 'texture' | 'canvas' | 'renderBuffer' | 'context';

export type GpuMemoryEntry = {
  kind: GpuMemoryKind;
  bytes: number;
  /** The volume of a texture, so a volume can leave out its own textures. */
  volumeId?: string;
};

/**
 * The estimate of the fixed cost of one vtk.js WebGL context. A page cannot
 * read this cost, so the value is a conservative constant.
 */
export const CONTEXT_OVERHEAD_BYTES = 32 * 1024 * 1024;

/** The bytes of one pixel of a canvas: RGBA8. */
export const CANVAS_BYTES_PER_PIXEL = 4;

/** The bytes of one pixel of a render buffer: RGBA8 color and depth-stencil. */
export const RENDER_BUFFER_BYTES_PER_PIXEL = 8;

const entries = new Map<unknown, GpuMemoryEntry>();

/**
 * Sets the entry of one owner. The owner is the object that holds the GPU
 * memory, such as a texture, or a string key. An entry of 0 bytes removes the
 * owner.
 */
export function setGpuMemoryEntry(owner: unknown, entry: GpuMemoryEntry): void {
  if (entry.bytes > 0) {
    entries.set(owner, entry);
  } else {
    entries.delete(owner);
  }
}

/** Removes the entry of one owner. */
export function removeGpuMemoryEntry(owner: unknown): void {
  entries.delete(owner);
}

/** The bytes of one owner, or 0. */
export function getGpuMemoryEntryBytes(owner: unknown): number {
  return entries.get(owner)?.bytes ?? 0;
}

/**
 * The GPU memory that this page uses, in bytes.
 *
 * The ledger is in memory only, so another tab does not count. Each owner adds
 * its entry when it allocates and removes it when it releases.
 *
 * @param excludeVolumeId - leaves out the textures of this volume
 */
export function getGpuMemoryTotal(excludeVolumeId?: string): number {
  let total = 0;

  for (const entry of entries.values()) {
    if (!excludeVolumeId || entry.volumeId !== excludeVolumeId) {
      total += entry.bytes;
    }
  }

  return total;
}

/** The bytes of each kind, for a readout. */
export function getGpuMemoryByKind(): Record<GpuMemoryKind, number> {
  const byKind: Record<GpuMemoryKind, number> = {
    texture: 0,
    canvas: 0,
    renderBuffer: 0,
    context: 0,
  };

  for (const entry of entries.values()) {
    byKind[entry.kind] += entry.bytes;
  }

  return byKind;
}

/** Removes every entry. For tests. */
export function resetGpuMemoryLedger(): void {
  entries.clear();
}
