import cache from '../../../cache/cache';
import volumeTextureStore from '../../../cache/volumeTextureStore';
import type { VoxelQualityRecord } from '../../../types';
import renderingEngineCache from '../../renderingEngineCache';
import {
  RenderModesPanel,
  type RenderModePanelBinding,
  type RenderModePanelEntry,
} from './RenderModesPanel';
import { StatsPanel } from './StatsPanel';
import type { Panel, StatsInstance, PerformanceWithMemory } from './types';
import { PanelType } from './enums';
import { STATS_CONFIG, PANEL_CONFIGS, CONVERSION } from './constants';
import { coreLog } from '../../../utilities/logger';
import {
  collectBindingFacts,
  markSharedVolumeTextures,
  summarizeTextureMemory,
  type DebugBindingsSource,
} from './collectBindingFacts';

const log = coreLog.getLogger('RenderingEngine', 'StatsOverlay');

/**
 * Singleton class for managing the stats overlay.
 * Provides FPS, MS, and memory usage monitoring.
 * Credits: https://github.com/mrdoob/stats.js/blob/master/LICENSE
 */
export class StatsOverlay implements StatsInstance {
  private static instance: StatsOverlay | null = null;

  public dom: HTMLDivElement | null = null;
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private frameCount = 0;
  private panels: Map<PanelType, Panel> = new Map();
  private metricsColumn: HTMLDivElement | null = null;
  private bindingsColumn: HTMLDivElement | null = null;
  private animationFrameId: number | null = null;
  private isSetup = false;
  private collapsed = false;
  private collapseButton: HTMLButtonElement | null = null;
  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private readonly handlePointerDown = (event: PointerEvent) =>
    this.onPointerDown(event);
  private readonly handlePointerMove = (event: PointerEvent) =>
    this.onPointerMove(event);
  private readonly handlePointerUp = (event: PointerEvent) =>
    this.onPointerUp(event);

  private constructor() {}

  /**
   * Gets the singleton instance of StatsOverlay.
   */
  public static getInstance(): StatsOverlay {
    if (!StatsOverlay.instance) {
      StatsOverlay.instance = new StatsOverlay();
    }
    return StatsOverlay.instance;
  }

  /**
   * Sets up the stats overlay and starts the animation loop.
   */
  public setup(): void {
    if (this.isSetup) {
      return;
    }

    try {
      // Initialize DOM and timing
      this.dom = this.createOverlayElement();
      this.startTime = performance.now();
      this.lastUpdateTime = this.startTime;

      // Initialize panels (all stacked vertically; no cycling).
      this.initializePanels();

      // Apply styles and add to DOM
      this.applyOverlayStyles();
      this.addCloseButton();
      this.addCollapseButtonOnNarrowWindow();
      this.restorePosition();
      this.attachDragHandlers();
      document.body.appendChild(this.dom);
      this.startLoop();
      this.isSetup = true;
    } catch (error) {
      log.warn('Failed to setup stats overlay:', error);
    }
  }

  /**
   * Cleans up the stats overlay by removing it from the DOM and stopping the animation loop.
   */
  public cleanup(): void {
    this.stopLoop();
    this.detachDragHandlers();

    if (this.dom && this.dom.parentNode) {
      this.dom.parentNode.removeChild(this.dom);
    }

    this.dom = null;
    this.metricsColumn = null;
    this.bindingsColumn = null;
    this.collapseButton = null;
    this.collapsed = false;
    this.panels.clear();
    this.isSetup = false;
  }

  /**
   * No-op retained for backwards compatibility with the {@link StatsInstance}
   * contract. Panels are always stacked vertically and all visible.
   */
  public showPanel(_panelType: number): void {
    // All panels are rendered together -- nothing to toggle.
  }

  /**
   * Updates the stats display.
   */
  public update(): void {
    this.startTime = this.updateStats();
  }

  /**
   * Creates the overlay DOM element.
   */
  private createOverlayElement(): HTMLDivElement {
    return document.createElement('div');
  }

  /**
   * Applies styles to the overlay element.
   */
  private applyOverlayStyles(): void {
    Object.assign(this.dom.style, STATS_CONFIG.OVERLAY_STYLES);
  }

  /**
   * Adds a top-right close control that dismisses the HUD without starting a drag.
   */
  private addCloseButton(): void {
    if (!this.dom) {
      return;
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close stats overlay');
    close.title = 'Close';
    close.textContent = '×';
    Object.assign(close.style, STATS_CONFIG.CLOSE_BUTTON_STYLES);

    close.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.cleanup();
    });

    this.dom.appendChild(close);
  }

  /**
   * On a narrow window (a phone) the overlay would cover the page, so it
   * starts collapsed to its buttons, with larger buttons for a finger, and a
   * second button expands or collapses it. A wide window keeps the overlay as
   * it was.
   */
  private addCollapseButtonOnNarrowWindow(): void {
    if (!this.dom || window.innerWidth >= STATS_CONFIG.NARROW_WINDOW_WIDTH) {
      return;
    }

    const size = `${STATS_CONFIG.NARROW_BUTTON_SIZE}px`;
    const close = this.dom.querySelector<HTMLButtonElement>(
      'button[aria-label="Close stats overlay"]'
    );
    const toggle = document.createElement('button');

    toggle.type = 'button';
    toggle.dataset.statsCollapse = 'true';
    Object.assign(toggle.style, STATS_CONFIG.CLOSE_BUTTON_STYLES, {
      right: `${STATS_CONFIG.NARROW_BUTTON_SIZE + 4}px`,
    });

    for (const button of [close, toggle]) {
      if (button) {
        Object.assign(button.style, {
          width: size,
          height: size,
          lineHeight: size,
          fontSize: '20px',
        });
      }
    }

    toggle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
    });
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.setCollapsed(!this.collapsed);
    });

    this.dom.style.paddingTop = `${STATS_CONFIG.NARROW_BUTTON_SIZE + 2}px`;
    this.fitPanelsToNarrowWindow();
    this.dom.appendChild(toggle);
    this.collapseButton = toggle;
    this.setCollapsed(true);
  }

  /**
   * Stacks the graphs above the bindings panel and gives the bindings panel
   * the width of the window, so nothing is cut off on a phone.
   */
  private fitPanelsToNarrowWindow(): void {
    if (!this.dom || !this.metricsColumn || !this.bindingsColumn) {
      return;
    }

    this.dom.style.flexDirection = 'column';
    this.dom.style.alignItems = 'flex-end';
    this.metricsColumn.style.flexDirection = 'row';
    this.metricsColumn.style.maxWidth = 'calc(100vw - 8px)';
    this.metricsColumn.style.overflowX = 'auto';

    const bindingsPanel = this.panels.get(PanelType.RENDER_MODES);

    if (bindingsPanel) {
      Object.assign(bindingsPanel.dom.style, {
        width: 'calc(100vw - 8px)',
        maxHeight: 'calc(100vh - 160px)',
      });
    }
  }

  /** Hides or shows the panels, and keeps the buttons. */
  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;

    for (const column of [this.metricsColumn, this.bindingsColumn]) {
      if (column) {
        column.style.display = collapsed ? 'none' : 'flex';
      }
    }

    if (this.dom) {
      this.dom.style.minWidth = collapsed
        ? `${2 * STATS_CONFIG.NARROW_BUTTON_SIZE + 4}px`
        : '';
    }

    if (this.collapseButton) {
      this.collapseButton.textContent = collapsed ? '+' : '−';
      this.collapseButton.title = collapsed ? 'Show stats' : 'Hide stats';
      this.collapseButton.setAttribute(
        'aria-label',
        collapsed ? 'Expand stats overlay' : 'Collapse stats overlay'
      );
    }

    if (!collapsed) {
      this.updateRenderModesPanel();
    }
  }

  /**
   * Initializes all panels.
   */
  private initializePanels(): void {
    this.initializePanelColumns();

    // Always create FPS and MS panels
    const fpsPanel = new StatsPanel(
      PANEL_CONFIGS[PanelType.FPS].name,
      PANEL_CONFIGS[PanelType.FPS].foregroundColor,
      PANEL_CONFIGS[PanelType.FPS].backgroundColor
    );
    this.addPanel(PanelType.FPS, fpsPanel);

    const msPanel = new StatsPanel(
      PANEL_CONFIGS[PanelType.MS].name,
      PANEL_CONFIGS[PanelType.MS].foregroundColor,
      PANEL_CONFIGS[PanelType.MS].backgroundColor
    );
    this.addPanel(PanelType.MS, msPanel);

    // Only create memory panel if available
    if (this.isMemoryAvailable()) {
      const memPanel = new StatsPanel(
        PANEL_CONFIGS[PanelType.MEMORY].name,
        PANEL_CONFIGS[PanelType.MEMORY].foregroundColor,
        PANEL_CONFIGS[PanelType.MEMORY].backgroundColor
      );
      this.addPanel(PanelType.MEMORY, memPanel);
    }

    this.addPanel(PanelType.RENDER_MODES, new RenderModesPanel());
  }

  private initializePanelColumns(): void {
    this.metricsColumn = document.createElement('div');
    this.metricsColumn.style.cssText = `
      display:flex;
      flex-direction:column;
      flex:0 0 auto;
    `;

    this.bindingsColumn = document.createElement('div');
    this.bindingsColumn.style.cssText = `
      display:flex;
      flex-direction:column;
      flex:0 1 auto;
      min-width:0;
    `;

    this.dom.appendChild(this.metricsColumn);
    this.dom.appendChild(this.bindingsColumn);
  }

  /**
   * Checks if memory monitoring is available.
   */
  private isMemoryAvailable(): boolean {
    const perf = performance as PerformanceWithMemory;
    return perf.memory !== undefined;
  }

  /**
   * Adds a panel to the overlay.
   */
  private addPanel(type: PanelType, panel: Panel): void {
    const column =
      type === PanelType.RENDER_MODES
        ? this.bindingsColumn
        : this.metricsColumn;

    (column ?? this.dom).appendChild(panel.dom);
    this.panels.set(type, panel);
  }

  /**
   * Starts the animation frame loop.
   */
  private startLoop(): void {
    const loop = () => {
      this.update();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the animation frame loop.
   */
  private stopLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Updates all stats panels.
   */
  private updateStats(): number {
    this.frameCount++;
    const currentTime = performance.now();
    const deltaTime = currentTime - this.startTime;

    // Update MS panel
    const msPanel = this.panels.get(PanelType.MS);
    if (msPanel) {
      msPanel.update(deltaTime, STATS_CONFIG.MAX_MS_VALUE);
    }

    // Update FPS panel every second
    if (currentTime >= this.lastUpdateTime + STATS_CONFIG.UPDATE_INTERVAL) {
      const fps =
        (this.frameCount * CONVERSION.MS_PER_SECOND) /
        (currentTime - this.lastUpdateTime);

      const fpsPanel = this.panels.get(PanelType.FPS);
      if (fpsPanel) {
        fpsPanel.update(fps, STATS_CONFIG.MAX_FPS_VALUE);
      }

      this.lastUpdateTime = currentTime;
      this.frameCount = 0;

      // Update memory panel if available
      this.updateMemoryPanel();

      if (!this.collapsed) {
        this.updateRenderModesPanel();
      }
    }

    return currentTime;
  }

  /**
   * Collects every viewport's GenericViewport binding debug state and volume
   * {@link VoxelQualityRecord}s. Within one tick, `getVoxelQuality` runs at
   * most once per `volumeId` so MPR viewports that share a volume do not
   * recompute the same record.
   */
  private updateRenderModesPanel(): void {
    const panel = this.panels.get(PanelType.RENDER_MODES);

    if (!(panel instanceof RenderModesPanel)) {
      return;
    }

    const qualityByVolumeId = new Map<string, VoxelQualityRecord | undefined>();
    const textureBytesByVolumeId = new Map<string, number>();
    const getVolumeTextureBytes = (volumeId: string) => {
      if (!textureBytesByVolumeId.has(volumeId)) {
        textureBytesByVolumeId.set(volumeId, readVolumeTextureBytes(volumeId));
      }

      return textureBytesByVolumeId.get(volumeId);
    };
    const entries: RenderModePanelEntry[] = [];

    for (const renderingEngine of renderingEngineCache.getAll()) {
      if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
        continue;
      }

      for (const viewport of renderingEngine.getViewports()) {
        const debugViewport = viewport as unknown as DebugBindingsViewport;
        const renderModes = debugViewport._debug?.renderModes;
        const volumeIds = this.collectViewportVolumeIds(debugViewport);
        const volumes = volumeIds.map((volumeId) => {
          if (!qualityByVolumeId.has(volumeId)) {
            qualityByVolumeId.set(volumeId, this.readVoxelQuality(volumeId));
          }

          return {
            volumeId,
            record: qualityByVolumeId.get(volumeId),
          };
        });

        const factsById = collectBindingFacts(
          debugViewport,
          getVolumeTextureBytes
        );

        entries.push({
          renderingEngineId: renderingEngine.id,
          viewportId: viewport.id,
          viewportType: viewport.type,
          bindings: this.getViewportBindingDebugEntries(
            debugViewport,
            (renderModes as Record<string, string> | undefined) ?? {}
          ).map((binding) => ({
            ...binding,
            ...factsById.get(binding.dataId),
          })),
          volumes,
        });
      }
    }

    markSharedVolumeTextures(entries);
    panel.setContent(
      entries,
      summarizeTextureMemory(entries, readTotalVolumeTextureBytes())
    );
  }

  private getViewportBindingDebugEntries(
    viewport: DebugBindingsViewport,
    renderModes: Record<string, string>
  ): RenderModePanelBinding[] {
    const actors = viewport.getActors?.() ?? [];
    const sourceDataId = viewport.getSourceDataId?.();
    const renderModeEntries = Object.entries(renderModes);

    if (renderModeEntries.length) {
      return renderModeEntries.map(([dataId, renderMode]) => {
        const role = resolveBindingRole(viewport, dataId, sourceDataId);
        const actor =
          role === 'source'
            ? viewport.getDefaultActor?.()
            : findActorForDataId(actors, dataId);

        return {
          actorUID: actor?.uid,
          dataId,
          referencedId: actor?.referencedId,
          renderMode,
          role,
          ...getActorScalarInfo(actor),
        };
      });
    }

    // Legacy viewports do not expose a GenericViewport `_debug.renderModes`
    // map, so derive the rows directly from the actors. This lets the debug
    // overlay show the same actor UID / referencedId info for legacy viewports
    // (e.g. to compare whether a labelmap actor is reused or recreated across
    // slices) instead of an empty bindings panel.
    return actors.map((actor) => {
      const dataId = actor.representationUID ?? actor.uid ?? '';

      return {
        actorUID: actor.uid,
        dataId,
        referencedId: actor.referencedId,
        renderMode: '-',
        role: resolveBindingRole(viewport, dataId, sourceDataId),
        ...getActorScalarInfo(actor),
      };
    });
  }

  /**
   * Volume ids bound to a viewport: source data id first, then actor
   * `referencedId`s that resolve in the volume cache.
   */
  private collectViewportVolumeIds(viewport: DebugBindingsViewport): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    const push = (candidate: string | undefined) => {
      if (!candidate || seen.has(candidate)) {
        return;
      }

      if (!cache.getVolume(candidate)) {
        return;
      }

      seen.add(candidate);
      ids.push(candidate);
    };

    push(viewport.getSourceDataId?.());

    for (const actor of viewport.getActors?.() ?? []) {
      push(actor.referencedId);
    }

    return ids;
  }

  private readVoxelQuality(volumeId: string): VoxelQualityRecord | undefined {
    try {
      const volume = cache.getVolume(volumeId) as
        | { getVoxelQuality?: () => VoxelQualityRecord | undefined }
        | undefined;

      if (typeof volume?.getVoxelQuality !== 'function') {
        return undefined;
      }

      return volume.getVoxelQuality();
    } catch {
      // The debug overlay must never throw on a missing or partial volume.
      return undefined;
    }
  }

  /**
   * Updates the memory panel if available.
   */
  private updateMemoryPanel(): void {
    const memPanel = this.panels.get(PanelType.MEMORY);
    if (!memPanel) {
      return;
    }

    const perf = performance as PerformanceWithMemory;
    if (perf.memory) {
      const memoryMB = perf.memory.usedJSHeapSize / CONVERSION.BYTES_TO_MB;
      const maxMemoryMB = perf.memory.jsHeapSizeLimit / CONVERSION.BYTES_TO_MB;
      memPanel.update(memoryMB, maxMemoryMB);
    }
  }

  private attachDragHandlers(): void {
    this.dom?.addEventListener('pointerdown', this.handlePointerDown);
  }

  private detachDragHandlers(): void {
    this.dom?.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.dom || event.button !== 0) {
      return;
    }

    // Close control handles its own pointer events; do not start a drag.
    if (
      event.target instanceof Element &&
      event.target.closest(
        'button[aria-label="Close stats overlay"], button[data-stats-collapse]'
      )
    ) {
      return;
    }

    this.dragPointerId = event.pointerId;
    const rect = this.dom.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;

    this.setPosition(rect.left, rect.top);

    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    event.preventDefault();
  }

  private onPointerMove(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId || !this.dom) {
      return;
    }

    this.setPosition(
      event.clientX - this.dragOffsetX,
      event.clientY - this.dragOffsetY
    );
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.dragPointerId !== event.pointerId || !this.dom) {
      return;
    }

    this.dragPointerId = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);

    const rect = this.dom.getBoundingClientRect();
    this.savePosition(rect.left, rect.top);
  }

  private setPosition(left: number, top: number): void {
    if (!this.dom) {
      return;
    }

    const clamped = this.clampToViewport(left, top);
    this.dom.style.left = `${clamped.left}px`;
    this.dom.style.top = `${clamped.top}px`;
    this.dom.style.right = 'auto';
    this.dom.style.bottom = 'auto';
  }

  private clampToViewport(
    left: number,
    top: number
  ): { left: number; top: number } {
    if (!this.dom) {
      return { left, top };
    }

    const width = this.dom.offsetWidth;
    const height = this.dom.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth - width);
    const maxTop = Math.max(0, window.innerHeight - height);

    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  private restorePosition(): void {
    const saved = this.readSavedPosition();
    if (!saved) {
      return;
    }

    this.setPosition(saved.left, saved.top);
  }

  private readSavedPosition(): { left: number; top: number } | null {
    try {
      const raw = window.localStorage.getItem(
        STATS_CONFIG.POSITION_STORAGE_KEY
      );
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as { left?: number; top?: number };
      if (
        typeof parsed?.left !== 'number' ||
        typeof parsed?.top !== 'number' ||
        !Number.isFinite(parsed.left) ||
        !Number.isFinite(parsed.top)
      ) {
        return null;
      }

      return { left: parsed.left, top: parsed.top };
    } catch {
      return null;
    }
  }

  private savePosition(left: number, top: number): void {
    try {
      window.localStorage.setItem(
        STATS_CONFIG.POSITION_STORAGE_KEY,
        JSON.stringify({ left, top })
      );
    } catch {
      // Storage may be unavailable (private mode, quota exceeded); ignore.
    }
  }
}

type DebugActorEntry = {
  referencedId?: string;
  representationUID?: string;
  uid?: string;
  actor?: DebugScalarActor;
};

/**
 * Minimal structural view of an actor that exposes the image data backing it,
 * covering both VTK actors (point-data scalars) and the canvas/CPU actors used
 * for the labelmap render paths (`getScalarData` + pixel-value range).
 */
type DebugScalarActor = {
  getMapper?: () =>
    | {
        getInputData?: () => DebugScalarInputData | null | undefined;
      }
    | null
    | undefined;
};

type DebugScalarInputData = {
  getPointData?: () =>
    | {
        getScalars?: () => DebugScalarArray | null | undefined;
      }
    | null
    | undefined;
  getScalarData?: () => ArrayLike<number> | null | undefined;
  minPixelValue?: number;
  maxPixelValue?: number;
};

type DebugScalarArray = {
  getDataType?: () => string;
  getNumberOfComponents?: () => number;
  getRange?: (componentIndex?: number) => number[];
};

type DebugBindingsViewport = DebugBindingsSource & {
  _debug?: {
    renderModes?: unknown;
  };
  getActors?: () => DebugActorEntry[];
  getDisplaySetRole?: (
    displaySetId: string
  ) => RenderModePanelBinding['role'] | undefined;
  getDefaultActor?: () => DebugActorEntry | undefined;
  getSourceDataId?: () => string | undefined;
};

/** The bytes of every 3D texture of one volume, or 0. Never throws. */
function readVolumeTextureBytes(volumeId: string): number {
  try {
    return volumeTextureStore
      .setsOfVolume(volumeId)
      .reduce((total, set) => total + set.bytes, 0);
  } catch {
    return 0;
  }
}

/** The bytes of every 3D texture of every volume, or 0. Never throws. */
function readTotalVolumeTextureBytes(): number {
  try {
    return volumeTextureStore.bytesUsed;
  } catch {
    return 0;
  }
}

function resolveBindingRole(
  viewport: DebugBindingsViewport,
  dataId: string,
  sourceDataId?: string
): RenderModePanelBinding['role'] {
  const role = viewport.getDisplaySetRole?.(dataId);

  if (role === 'source' || role === 'overlay') {
    return role;
  }

  if (sourceDataId && dataId === sourceDataId) {
    return 'source';
  }

  return 'data';
}

function findActorForDataId(
  actors: DebugActorEntry[],
  dataId: string
): DebugActorEntry | undefined {
  return actors.find(
    (actor) =>
      actor.uid === dataId ||
      actor.representationUID === dataId ||
      actor.referencedId === dataId
  );
}

/**
 * Reads the scalar buffer type (e.g. `Uint8Array`) and value range backing an
 * actor so the debug overlay can surface what data is actually loaded. Works
 * for both VTK actors (via point-data scalars) and the canvas/CPU labelmap
 * actors (via `getScalarData` + precomputed pixel-value range).
 *
 * VTK's `getRange()` is cached per component, so polling it from the overlay
 * loop is cheap after the first computation. This is best-effort and never
 * throws -- actors without scalar image data (surfaces, geometry) simply
 * return no scalar info.
 */
function getActorScalarInfo(entry: DebugActorEntry | undefined): {
  scalarType?: string;
  scalarRange?: [number, number];
  numberOfComponents?: number;
} {
  const inputData = entry?.actor?.getMapper?.()?.getInputData?.();
  if (!inputData) {
    return {};
  }

  try {
    const scalars = inputData.getPointData?.()?.getScalars?.();
    if (scalars?.getDataType) {
      const numberOfComponents = scalars.getNumberOfComponents?.() ?? 1;
      // For multi-component (e.g. RGB) read the first component to avoid the
      // magnitude allocation that `getRange(-1)` performs.
      const range =
        numberOfComponents > 1 ? scalars.getRange?.(0) : scalars.getRange?.();

      return {
        scalarType: scalars.getDataType(),
        scalarRange: normalizeRange(range),
        numberOfComponents,
      };
    }

    const scalarData = inputData.getScalarData?.();
    if (scalarData?.constructor?.name) {
      const range =
        Number.isFinite(inputData.minPixelValue) &&
        Number.isFinite(inputData.maxPixelValue)
          ? [inputData.minPixelValue, inputData.maxPixelValue]
          : undefined;

      return {
        scalarType: scalarData.constructor.name,
        scalarRange: normalizeRange(range),
      };
    }
  } catch {
    // The debug overlay must never throw; skip scalar info on failure.
  }

  return {};
}

function normalizeRange(
  range: number[] | undefined
): [number, number] | undefined {
  if (
    !range ||
    range.length < 2 ||
    !Number.isFinite(range[0]) ||
    !Number.isFinite(range[1])
  ) {
    return undefined;
  }

  return [range[0], range[1]];
}
