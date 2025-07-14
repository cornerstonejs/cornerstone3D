import { StatsPanel } from './StatsPanel';
import type { Panel, StatsInstance } from './types';

/**
 * Singleton class for managing the stats overlay.
 * Provides FPS, MS, and memory usage monitoring.
 */
export class StatsOverlay implements StatsInstance {
  private static instance: StatsOverlay | null = null;

  public dom: HTMLDivElement;
  private mode = 0;
  private beginTime: number;
  private prevTime: number;
  private frames = 0;
  private fpsPanel: Panel;
  private msPanel: Panel;
  private memPanel?: Panel;
  private panels: Panel[] = [];
  private animationFrameId: number | null = null;
  private isSetup = false;

  private constructor() {
    this.dom = document.createElement('div');
    this.dom.style.cssText =
      'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
    this.dom.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        this.showPanel(++this.mode % this.dom.children.length);
      },
      false
    );

    this.beginTime = performance.now();
    this.prevTime = this.beginTime;

    this.fpsPanel = this.addPanel(new StatsPanel('FPS', '#0ff', '#002'));
    this.msPanel = this.addPanel(new StatsPanel('MS', '#0f0', '#020'));

    if (performance.memory) {
      this.memPanel = this.addPanel(new StatsPanel('MB', '#f08', '#201'));
    }

    this.showPanel(0);
  }

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
    // If already setup, don't do anything
    if (this.isSetup) {
      return;
    }

    try {
      const statsElement = this.dom;
      statsElement.style.position = 'fixed';
      statsElement.style.top = '0px';
      statsElement.style.right = '0px';
      statsElement.style.left = 'auto';
      statsElement.style.zIndex = '9999';

      document.body.appendChild(statsElement);

      // Start the animation loop
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

    this.isSetup = false;
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

  private addPanel(panel: Panel): Panel {
    this.dom.appendChild(panel.dom);
    this.panels.push(panel);
    return panel;
  }

  public showPanel(id: number): void {
    for (let i = 0; i < this.dom.children.length; i++) {
      (this.dom.children[i] as HTMLElement).style.display =
        i === id ? 'block' : 'none';
    }
    this.mode = id;
  }

  public update(): void {
    this.beginTime = this.end();
  }

  private end(): number {
    this.frames++;

    const time = performance.now();

    this.msPanel.update(time - this.beginTime, 200);

    if (time >= this.prevTime + 1000) {
      this.fpsPanel.update((this.frames * 1000) / (time - this.prevTime), 100);

      this.prevTime = time;
      this.frames = 0;

      if (this.memPanel && performance.memory) {
        const memory = performance.memory as {
          usedJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
        this.memPanel.update(
          memory.usedJSHeapSize / 1048576,
          memory.jsHeapSizeLimit / 1048576
        );
      }
    }

    return time;
  }
}
