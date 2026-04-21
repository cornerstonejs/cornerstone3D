import renderingEngineCache from '../../renderingEngineCache';
import { RenderModesPanel } from './RenderModesPanel';
import { StatsPanel } from './StatsPanel';
import type { Panel, StatsInstance, PerformanceWithMemory } from './types';
import { PanelType } from './enums';
import { STATS_CONFIG, PANEL_CONFIGS, CONVERSION } from './constants';

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
  private animationFrameId: number | null = null;
  private isSetup = false;
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
      this.restorePosition();
      this.attachDragHandlers();
      document.body.appendChild(this.dom);
      this.startLoop();
      this.isSetup = true;
    } catch (error) {
      console.warn('Failed to setup stats overlay:', error);
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
   * Initializes all panels.
   */
  private initializePanels(): void {
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
    this.dom.appendChild(panel.dom);
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
      this.updateRenderModesPanel();
    }

    return currentTime;
  }

  /**
   * Collects every viewport's internal `_debug.renderModes` from the
   * rendering engine cache and pushes the flat list to the render-modes panel.
   */
  private updateRenderModesPanel(): void {
    const panel = this.panels.get(PanelType.RENDER_MODES);

    if (!(panel instanceof RenderModesPanel)) {
      return;
    }

    const entries: Array<{
      renderingEngineId: string;
      viewportId: string;
      renderModes: Record<string, string>;
    }> = [];

    for (const renderingEngine of renderingEngineCache.getAll()) {
      if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
        continue;
      }

      for (const viewport of renderingEngine.getViewports()) {
        const renderModes = (
          viewport as unknown as { _debug?: { renderModes?: unknown } }
        )._debug?.renderModes;

        entries.push({
          renderingEngineId: renderingEngine.id,
          viewportId: viewport.id,
          renderModes:
            (renderModes as Record<string, string> | undefined) ?? {},
        });
      }
    }

    panel.setContent(entries);
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
