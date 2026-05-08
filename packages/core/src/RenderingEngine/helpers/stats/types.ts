/**
 * Interface for individual stats panels (FPS, MS, MB).
 */
interface Panel {
  dom: HTMLCanvasElement;
  update: (value: number, maxValue: number) => void;
}

/**
 * Interface for the main stats instance.
 */
interface StatsInstance {
  dom: HTMLDivElement;
  showPanel: (id: number) => void;
  update: () => void;
  destroy?: () => void;
}

/**
 * Extended Performance interface with memory property
 */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/**
 * Configuration for panel styling
 */
interface PanelConfig {
  name: string;
  foregroundColor: string;
  backgroundColor: string;
}

export type { Panel, StatsInstance, PerformanceWithMemory, PanelConfig };
