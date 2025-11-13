/**
 * BrushTool – cursor strategy extension (BC-safe)
 * Single-file example wired to a hypothetical existing BrushTool.ts.
 *
 * How to use:
 * 1) Drop this into your BrushTool file or import the parts you need.
 * 2) Keep your existing draw strategies and config shape intact.
 * 3) Register cursor geometry/render strategies and env tokens once at startup.
 *
 * Notes:
 * - No breaking changes to your existing configuration.strategies map or draw strategy API.
 * - New cursor strategies are orthogonal and composable.
 * - Env tokens let strategies depend on any dynamic input without changing interfaces again.
 */

/* =========================
 * Existing types (placeholders)
 * Replace these with your real types and helpers from your codebase.
 * ========================= */

namespace Types {
  export type Point2 = [number, number];
  export type Point3 = [number, number, number];

  export type Color = string | { r: number; g: number; b: number; a?: number };

  export interface IViewport {
    canvasToWorld(canvas: Point2): Point3;
  }
}

type SVGDrawingHelper = {
  circle: (id: string, center: Types.Point2, radius: number, opts?: { color?: Types.Color; dashed?: boolean }) => void;
  rect: (id: string, topLeft: Types.Point2, bottomRight: Types.Point2, opts?: { color?: Types.Color; dashed?: boolean }) => void;
  polyline: (id: string, points: Types.Point2[], opts?: { color?: Types.Color; dashed?: boolean }) => void;
  clearGroup: (groupId: string) => void;
};

type InteractionEvent = {
  detail: {
    element: HTMLElement;
    currentPoints: { canvas: Types.Point2 };
  };
};

type LabelmapToolOperationDataStack = unknown;
type LabelmapToolOperationDataVolume = unknown;

type StrategyCallbacks = {
  onProgress?: (v: number) => void;
  onDone?: () => void;
};

declare function getEnabledElement(el: HTMLElement): { viewport: Types.IViewport } | undefined;
declare function getSvgHelperForElement(el: HTMLElement): SVGDrawingHelper;
declare function getCursorColor(): Types.Color;
declare function hideElementCursor(el: HTMLElement): void;

/* =========================
 * 1) Cursor strategy model
 * ========================= */

export type CursorGeometry =
  | { kind: 'circle'; center: Types.Point2; radiusPx: number }
  | { kind: 'rect'; topLeft: Types.Point2; bottomRight: Types.Point2 }
  | { kind: 'polyline'; points: Types.Point2[] }
  | { kind: 'none' };

export type StrategyId = string;

// Minimal, stable ctx. Do not grow this for new dependencies.
export type BaseCursorCtx = Readonly<{
  viewport: Types.IViewport;
  currentCanvas: Types.Point2;
  currentWorld: Types.Point3;
  toolConfiguration: BrushConfiguration;
}>;

// Typed token identity
declare const token: unique symbol;
export type Token<T> = { readonly [token]: T; readonly key: string };

// Signal interface for any external dependency
export type EnvSignal<T> = {
  read(): T | undefined;
  onChange(fn: () => void): () => void; // returns unsubscribe
};

// Lookup interface exposed to strategies
export interface EnvReader {
  get<T>(t: Token<T>): EnvSignal<T> | undefined;
}

export interface CursorGeometryStrategy {
  readonly id: StrategyId;
  readonly requires?: ReadonlyArray<Token<unknown>>;
  compute(ctx: BaseCursorCtx, env: EnvReader): CursorGeometry;
}

export interface CursorRenderStrategy {
  readonly id: StrategyId;
  draw(input: { svg: SVGDrawingHelper; color: Types.Color; geometry: CursorGeometry }): void;
}

// Legacy draw strategy stays intact
export interface DrawStrategy {
  readonly id: StrategyId;
  apply: (
    op:
      | LabelmapToolOperationDataStack
      | LabelmapToolOperationDataVolume,
    cb?: StrategyCallbacks
  ) => unknown;

  // optional default cursor pairing for nice defaults
  defaultCursor?: { geometry: StrategyId; render: StrategyId };
}

/* =========================
 * 2) Registries
 * ========================= */

type Registry<T extends { id: StrategyId }> = Map<StrategyId, T>;

const drawRegistry: Registry<DrawStrategy> = new Map();
const cursorGeometryRegistry: Registry<CursorGeometryStrategy> = new Map();
const cursorRenderRegistry: Registry<CursorRenderStrategy> = new Map();

export const registerDraw = (s: DrawStrategy) => (drawRegistry.set(s.id, s), s.id);
export const registerCursorGeometry = (s: CursorGeometryStrategy) =>
  (cursorGeometryRegistry.set(s.id, s), s.id);
export const registerCursorRender = (s: CursorRenderStrategy) =>
  (cursorRenderRegistry.set(s.id, s), s.id);

/* =========================
 * 3) Environment tokens and registry
 * ========================= */

class EnvRegistry implements EnvReader {
  private map = new Map<Token<any>, EnvSignal<any>>();
  register<T>(t: Token<T>, signal: EnvSignal<T>) {
    this.map.set(t, signal);
  }
  get<T>(t: Token<T>): EnvSignal<T> | undefined {
    return this.map.get(t);
  }
}

// Example tokens. Add any others without changing interfaces.
export const WINDOW_LEVEL: Token<{ width: number; center: number }> = { key: 'voi' } as const;
export const ZOOM_SCALE: Token<number> = { key: 'zoom' } as const;

// Global or per-tool env registry instance
const env = new EnvRegistry();

/* =========================
 * 4) Configuration (BC-safe)
 * ========================= */

export type BrushConfiguration = {
  // existing fields preserved
  strategies: Record<string, DrawStrategy['apply']>;
  activeStrategy: string;

  // new optional override for cursor pairing
  cursor?: {
    geometry?: StrategyId;
    render?: StrategyId;
  };

  // optional guard
  strictCursorMatch?: boolean;

  // any other existing knobs (e.g., brushSize) stay here
  brushSize?: number;
  squareSize?: number;
  minBrushSize?: number;
  maxBrushSize?: number;
};

/* =========================
 * 5) Example strategies
 * ========================= */

// Geometry 1: simple circle from brushSize
registerCursorGeometry({
  id: 'GEOM_CIRCLE_CENTER_RADIUS',
  compute: ({ currentCanvas, toolConfiguration }) => {
    const radiusPx = Math.max(1, Math.round(toolConfiguration.brushSize ?? 8));
    return { kind: 'circle', center: currentCanvas, radiusPx };
  },
});

// Geometry 2: WL-scaled disk using token
registerCursorGeometry({
  id: 'GEOM_WL_SCALED_DISK',
  requires: [WINDOW_LEVEL],
  compute: ({ currentCanvas, toolConfiguration }, reader) => {
    const wl = reader.get(WINDOW_LEVEL)?.read();
    const base = toolConfiguration.brushSize ?? 8;
    const ww = wl?.width ?? 400;
    const min = toolConfiguration.minBrushSize ?? 4;
    const max = toolConfiguration.maxBrushSize ?? 64;
    const k = Math.log2(Math.max(ww, 1));
    const radiusPx = Math.max(min, Math.min(max, Math.round(base * (1 + k / 6))));
    return { kind: 'circle', center: currentCanvas, radiusPx };
  },
});

// Geometry 3: square from squareSize
registerCursorGeometry({
  id: 'GEOM_RECT_CENTER_SIZE',
  compute: ({ currentCanvas, toolConfiguration }) => {
    const size = Math.max(1, Math.round(toolConfiguration.squareSize ?? 10));
    const half = size / 2;
    return {
      kind: 'rect',
      topLeft: [currentCanvas[0] - half, currentCanvas[1] - half],
      bottomRight: [currentCanvas[0] + half, currentCanvas[1] + half],
    };
  },
});

// Render: outline that supports multiple kinds
registerCursorRender({
  id: 'RENDER_OUTLINE',
  draw: ({ svg, color, geometry }) => {
    if (geometry.kind === 'circle') {
      svg.circle('cursor', geometry.center, geometry.radiusPx, { color });
    } else if (geometry.kind === 'rect') {
      svg.rect('cursor', geometry.topLeft, geometry.bottomRight, { color });
    } else if (geometry.kind === 'polyline') {
      svg.polyline('cursor', geometry.points, { color });
    }
  },
});

// Render: dashed outline
registerCursorRender({
  id: 'RENDER_DASHED',
  draw: ({ svg, color, geometry }) => {
    if (geometry.kind === 'circle') {
      svg.circle('cursor', geometry.center, geometry.radiusPx, { color, dashed: true });
    } else if (geometry.kind === 'rect') {
      svg.rect('cursor', geometry.topLeft, geometry.bottomRight, { color, dashed: true });
    } else if (geometry.kind === 'polyline') {
      svg.polyline('cursor', geometry.points, { color, dashed: true });
    }
  },
});

/* =========================
 * 6) Example draw strategies with defaults (adapters)
 * Keep these adapters near where you define your existing draw fns.
 * ========================= */

function fillInsideCircle(op: LabelmapToolOperationDataStack | LabelmapToolOperationDataVolume) { /* existing impl */ }
function eraseInsideCircle(op: LabelmapToolOperationDataStack | LabelmapToolOperationDataVolume) { /* existing impl */ }

registerDraw({
  id: 'FILL_INSIDE_CIRCLE',
  apply: fillInsideCircle,
  defaultCursor: { geometry: 'GEOM_CIRCLE_CENTER_RADIUS', render: 'RENDER_OUTLINE' },
});

registerDraw({
  id: 'ERASE_INSIDE_CIRCLE',
  apply: eraseInsideCircle,
  defaultCursor: { geometry: 'GEOM_CIRCLE_CENTER_RADIUS', render: 'RENDER_DASHED' },
});

/* =========================
 * 7) BrushTool integration points
 * ========================= */

export class BrushTool {
  public configuration: BrushConfiguration;

  // store last event to allow env-triggered updates
  private lastInteractionEvent?: InteractionEvent;

  // active subscriptions to env signals
  private envUnsubs: Array<() => void> = [];

  constructor(config: BrushConfiguration) {
    this.configuration = config;
  }

  // Call at app init to connect real env signals
  static wireEnvironment(params: {
    // sample providers
    windowLevel?: EnvSignal<{ width: number; center: number }>;
    zoomScale?: EnvSignal<number>;
  }) {
    if (params.windowLevel) env.register(WINDOW_LEVEL, params.windowLevel);
    if (params.zoomScale) env.register(ZOOM_SCALE, params.zoomScale);
  }

  // Resolve which cursor pair to use
  private resolveCursorPair(): { geomId: StrategyId; renderId: StrategyId } | null {
    const explicit = this.configuration.cursor;
    if (explicit?.geometry && explicit?.render) {
      return { geomId: explicit.geometry, renderId: explicit.render };
    }
    const draw = drawRegistry.get(this.configuration.activeStrategy);
    if (draw?.defaultCursor) return draw.defaultCursor;
    return null;
  }

  // Subscribe to env changes for current geometry strategy
  private watchDepsForGeometry(geomId: StrategyId) {
    // clear previous
    for (const u of this.envUnsubs) u();
    this.envUnsubs = [];

    const geom = cursorGeometryRegistry.get(geomId);
    if (!geom || !geom.requires) return;

    for (const t of geom.requires) {
      const sig = env.get(t as Token<unknown>);
      if (!sig) continue;
      const unsub = sig.onChange(() => {
        if (this.lastInteractionEvent) {
          this.updateCursor(this.lastInteractionEvent); // recompute on env change
        }
      });
      this.envUnsubs.push(unsub);
    }
  }

  // Call this from your pointer move / drag handlers
  public updateCursor = (evt: InteractionEvent): void => {
    this.lastInteractionEvent = evt;

    const { element, currentPoints } = evt.detail;
    const enabled = getEnabledElement(element);
    if (!enabled) return;

    const pair = this.resolveCursorPair();
    if (!pair) { hideElementCursor(element); return; }

    const geom = cursorGeometryRegistry.get(pair.geomId);
    const render = cursorRenderRegistry.get(pair.renderId);
    if (!geom || !render) { hideElementCursor(element); return; }

    // keep subscriptions aligned with the active geometry strategy
    this.watchDepsForGeometry(geom.id);

    const currentCanvas = currentPoints.canvas;
    const currentWorld = enabled.viewport.canvasToWorld(currentCanvas);
    const baseCtx: BaseCursorCtx = {
      viewport: enabled.viewport,
      currentCanvas,
      currentWorld,
      toolConfiguration: this.configuration,
    };

    const geometry = geom.compute(baseCtx, env);
    const svg = getSvgHelperForElement(element);
    const color = getCursorColor();
    svg.clearGroup('cursor');
    render.draw({ svg, color, geometry });
  };

  // Call when strategy changes
  public setActiveStrategy(id: StrategyId) {
    this.configuration = { ...this.configuration, activeStrategy: id };
    // rebuild subscriptions for new geometry if any
    const pair = this.resolveCursorPair();
    if (pair) this.watchDepsForGeometry(pair.geomId);
  }

  // Optional strict matching guard, invoked during mousedown or strategy switch
  public validateCursorCompatibility(geometry: CursorGeometry, drawId: StrategyId): boolean {
    if (!this.configuration.strictCursorMatch) return true;
    const g = geometry.kind;
    if (g === 'circle') return /CIRCLE/i.test(drawId);
    if (g === 'rect') return /RECT|SQUARE/i.test(drawId);
    if (g === 'polyline') return true; // generic
    return true;
  }
}

/* =========================
 * 8) Example: connect real WL source to env
 * Call once during tool or viewport init.
 * ========================= */

function makeVOISignalFromViewport(vp: Types.IViewport): EnvSignal<{ width: number; center: number }> {
  let current: { width: number; center: number } | undefined;
  let listeners = new Set<() => void>();

  // wire to your framework's VOI events and update `current`, then notify
  // Example placeholders:
  function onVoiChanged(newWidth: number, newCenter: number) {
    current = { width: newWidth, center: newCenter };
    for (const l of listeners) l();
  }

  // return signal
  return {
    read: () => current,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Example startup glue (adjust to your app):
// const voiSignal = makeVOISignalFromViewport(enabled.viewport);
// BrushTool.wireEnvironment({ windowLevel: voiSignal });

/* =========================
 * 9) Example configuration usage
 * ========================= */

const tool = new BrushTool({
  strategies: {
    FILL_INSIDE_CIRCLE: fillInsideCircle,
    ERASE_INSIDE_CIRCLE: eraseInsideCircle,
  },
  activeStrategy: 'FILL_INSIDE_CIRCLE',
  cursor: {
    // override defaults or omit to use draw strategy defaultCursor
    geometry: 'GEOM_WL_SCALED_DISK',
    render: 'RENDER_OUTLINE',
  },
  brushSize: 8,
  minBrushSize: 4,
  maxBrushSize: 64,
  strictCursorMatch: false,
});

// In your pointer move handler:
// tool.updateCursor(interactionEvent);

// When user switches strategies:
// tool.setActiveStrategy('ERASE_INSIDE_CIRCLE');
