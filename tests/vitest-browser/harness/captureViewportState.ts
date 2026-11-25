// Captures a render-path-agnostic snapshot of PlanarViewport public state.
//
// Design rule: everything in `core` must be identical across render modes
// for the same public-API scenario; anything render-path-dependent belongs
// in `pathSpecific`.

import type { PlanarViewport, Types } from '@cornerstonejs/core';

export interface ViewportStateSnapshot {
  core: {
    type: string;
    currentMode: string;
    sliceIndex: number;
    currentImageIdIndex: number;
    numberOfSlices: number;
    zoom: number;
    pan: [number, number];
    rotation: number;
    frameOfReferenceUID: string;
    viewState: unknown;
    viewReference: unknown;
    presentation: unknown;
    worldProbes: Array<{
      canvas: [number, number];
      world: [number, number, number];
    }>;
    actorCount: number;
  };
  pathSpecific: {
    actorClassNames: string[];
    actorUIDs: string[];
  };
}

const DEFAULT_PROBE_CANVAS_POINTS: Array<[number, number]> = [
  [200, 200],
  [100, 100],
  [300, 250],
];

export function round6(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }

  // `|| 0` folds -0 to +0 so snapshots are stable under JSON round-tripping
  // and under toEqual, which (unlike Object.is) still distinguishes -0/+0.
  return Math.round(value * 1e6) / 1e6 || 0;
}

/**
 * Deep-clones and rounds every number recursively, converting typed arrays
 * to plain arrays and dropping `undefined`-valued object properties, so the
 * result survives JSON.parse(JSON.stringify(...)) unchanged (JSON.stringify
 * itself drops undefined object properties, so the snapshot must not rely
 * on their presence).
 */
function normalize(value: unknown): unknown {
  if (typeof value === 'number') {
    return round6(value);
  }

  if (
    value instanceof Float32Array ||
    value instanceof Float64Array ||
    value instanceof Int32Array ||
    value instanceof Uint32Array ||
    value instanceof Int16Array ||
    value instanceof Uint16Array ||
    value instanceof Uint8Array
  ) {
    return Array.from(value, (item) => round6(item));
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      const normalized = normalize(source[key]);

      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }

    return out;
  }

  return value;
}

function getActorClassName(actor: unknown): string {
  const maybeGetClassName = (actor as { getClassName?: () => string })
    ?.getClassName;

  if (typeof maybeGetClassName === 'function') {
    return maybeGetClassName.call(actor);
  }

  return (actor as { constructor?: { name?: string } })?.constructor?.name ??
    'Unknown';
}

export function captureViewportState(
  viewport: PlanarViewport,
  displaySetId: string,
  probeCanvasPoints: Array<[number, number]> = DEFAULT_PROBE_CANVAS_POINTS
): ViewportStateSnapshot {
  const pan = viewport.getPan();
  const worldProbes = probeCanvasPoints.map(([x, y]) => {
    const world = viewport.canvasToWorld([x, y] as Types.Point2);

    return {
      canvas: [round6(x), round6(y)] as [number, number],
      world: [round6(world[0]), round6(world[1]), round6(world[2])] as [
        number,
        number,
        number,
      ],
    };
  });

  const actors = viewport.getActors();

  return {
    core: {
      type: viewport.type,
      currentMode: viewport.getCurrentMode(),
      sliceIndex: viewport.getSliceIndex(),
      currentImageIdIndex: viewport.getCurrentImageIdIndex(),
      numberOfSlices: viewport.getNumberOfSlices(),
      zoom: round6(viewport.getZoom()),
      pan: [round6(pan[0]), round6(pan[1])],
      rotation: round6(viewport.getRotation()),
      frameOfReferenceUID: viewport.getFrameOfReferenceUID(),
      viewState: normalize(viewport.getViewState()),
      viewReference: normalize(viewport.getViewReference()),
      presentation: normalize(viewport.getDisplaySetPresentation(displaySetId)),
      worldProbes,
      actorCount: actors.length,
    },
    pathSpecific: {
      actorClassNames: actors.map((entry) => getActorClassName(entry.actor)),
      actorUIDs: actors.map((entry) => entry.uid),
    },
  };
}
