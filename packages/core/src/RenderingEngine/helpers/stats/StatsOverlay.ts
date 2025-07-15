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
  private currentMode = 0;
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private frameCount = 0;
  private panels: Map<PanelType, Panel> = new Map();
  private animationFrameId: number | null = null;
  private isSetup = false;

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

      // Initialize panels and show default
      this.initializePanels();
      this.showPanel(PanelType.FPS);

      // Apply styles and add to DOM
      this.applyOverlayStyles();
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

    if (this.dom && this.dom.parentNode) {
      this.dom.parentNode.removeChild(this.dom);
    }

    this.dom = null;
    this.panels.clear();
    this.isSetup = false;
  }

  /**
   * Shows a specific panel by its type.
   */
  public showPanel(panelType: number): void {
    const children = Array.from(this.dom.children) as HTMLElement[];
    children.forEach((child, index) => {
      child.style.display = index === panelType ? 'block' : 'none';
    });
    this.currentMode = panelType;
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
    const element = document.createElement('div');
    element.addEventListener('click', this.handleClick.bind(this), false);
    return element;
  }

  /**
   * Applies styles to the overlay element.
   */
  private applyOverlayStyles(): void {
    Object.assign(this.dom.style, STATS_CONFIG.OVERLAY_STYLES);
  }

  /**
   * Handles click events on the overlay.
   */
  private handleClick(event: MouseEvent): void {
    event.preventDefault();
    const panelCount = this.dom.children.length;
    this.showPanel((this.currentMode + 1) % panelCount);
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
    }

    return currentTime;
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
}
