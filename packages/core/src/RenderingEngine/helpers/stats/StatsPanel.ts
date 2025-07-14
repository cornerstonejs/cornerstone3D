import type { Panel } from './types';

/**
 * Individual panel for displaying stats (FPS, MS, MB).
 */
export class StatsPanel implements Panel {
  public dom: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private min = Infinity;
  private max = 0;
  private name: string;
  private fg: string;
  private bg: string;
  private PR: number;
  private WIDTH: number;
  private HEIGHT: number;
  private TEXT_X: number;
  private TEXT_Y: number;
  private GRAPH_X: number;
  private GRAPH_Y: number;
  private GRAPH_WIDTH: number;
  private GRAPH_HEIGHT: number;

  constructor(name: string, fg: string, bg: string) {
    this.name = name;
    this.fg = fg;
    this.bg = bg;
    this.PR = Math.round(window.devicePixelRatio || 1);

    this.WIDTH = 80 * this.PR;
    this.HEIGHT = 48 * this.PR;
    this.TEXT_X = 3 * this.PR;
    this.TEXT_Y = 2 * this.PR;
    this.GRAPH_X = 3 * this.PR;
    this.GRAPH_Y = 15 * this.PR;
    this.GRAPH_WIDTH = 74 * this.PR;
    this.GRAPH_HEIGHT = 30 * this.PR;

    this.dom = document.createElement('canvas');
    this.dom.width = this.WIDTH;
    this.dom.height = this.HEIGHT;
    this.dom.style.cssText = 'width:80px;height:48px';

    this.context = this.dom.getContext('2d')!;
    this.context.font = `bold ${9 * this.PR}px Helvetica,Arial,sans-serif`;
    this.context.textBaseline = 'top';

    this.context.fillStyle = bg;
    this.context.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    this.context.fillStyle = fg;
    this.context.fillText(name, this.TEXT_X, this.TEXT_Y);
    this.context.fillRect(
      this.GRAPH_X,
      this.GRAPH_Y,
      this.GRAPH_WIDTH,
      this.GRAPH_HEIGHT
    );

    this.context.fillStyle = bg;
    this.context.globalAlpha = 0.9;
    this.context.fillRect(
      this.GRAPH_X,
      this.GRAPH_Y,
      this.GRAPH_WIDTH,
      this.GRAPH_HEIGHT
    );
  }

  update(value: number, maxValue: number): void {
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    this.context.fillStyle = this.bg;
    this.context.globalAlpha = 1;
    this.context.fillRect(0, 0, this.WIDTH, this.GRAPH_Y);
    this.context.fillStyle = this.fg;
    this.context.fillText(
      `${Math.round(value)} ${this.name} (${Math.round(this.min)}-${Math.round(
        this.max
      )})`,
      this.TEXT_X,
      this.TEXT_Y
    );

    this.context.drawImage(
      this.dom,
      this.GRAPH_X + this.PR,
      this.GRAPH_Y,
      this.GRAPH_WIDTH - this.PR,
      this.GRAPH_HEIGHT,
      this.GRAPH_X,
      this.GRAPH_Y,
      this.GRAPH_WIDTH - this.PR,
      this.GRAPH_HEIGHT
    );

    this.context.fillRect(
      this.GRAPH_X + this.GRAPH_WIDTH - this.PR,
      this.GRAPH_Y,
      this.PR,
      this.GRAPH_HEIGHT
    );

    this.context.fillStyle = this.bg;
    this.context.globalAlpha = 0.9;
    this.context.fillRect(
      this.GRAPH_X + this.GRAPH_WIDTH - this.PR,
      this.GRAPH_Y,
      this.PR,
      Math.round((1 - value / maxValue) * this.GRAPH_HEIGHT)
    );
  }
}
