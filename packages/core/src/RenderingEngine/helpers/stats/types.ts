/**
 * Interface for individual stats panels (FPS, MS, MB).
 */
export interface Panel {
  dom: HTMLCanvasElement;
  update: (value: number, maxValue: number) => void;
}

/**
 * Interface for the main stats instance.
 */
export interface StatsInstance {
  dom: HTMLDivElement;
  showPanel: (id: number) => void;
  update: () => void;
  destroy?: () => void;
}
