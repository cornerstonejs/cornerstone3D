import type { Panel } from './types';
import { PANEL_CONFIG } from './constants';

/**
 * Individual panel for displaying stats (FPS, MS, MB).
 * Credits: https://github.com/mrdoob/stats.js/blob/master/LICENSE
 */
export class StatsPanel implements Panel {
  public dom: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private minValue = Infinity;
  private maxValue = 0;

  private readonly name: string;
  private readonly foregroundColor: string;
  private readonly backgroundColor: string;
  private readonly devicePixelRatio: number;

  // Calculated dimensions
  private readonly dimensions: {
    width: number;
    height: number;
    textX: number;
    textY: number;
    graphX: number;
    graphY: number;
    graphWidth: number;
    graphHeight: number;
  };

  constructor(name: string, foregroundColor: string, backgroundColor: string) {
    this.name = name;
    this.foregroundColor = foregroundColor;
    this.backgroundColor = backgroundColor;
    this.devicePixelRatio = Math.round(window.devicePixelRatio || 1);

    // Calculate dimensions based on device pixel ratio
    this.dimensions = this.calculateDimensions();

    // Initialize canvas
    this.dom = this.createCanvas();
    this.context = this.initializeContext();

    // Draw initial panel
    this.drawInitialPanel();
  }

  /**
   * Updates the panel with a new value.
   */
  public update(value: number, maxValue: number): void {
    this.updateMinMax(value);
    this.clearTextArea();
    this.drawText(value);
    this.scrollGraph();
    this.drawNewValue(value, maxValue);
  }

  /**
   * Calculates panel dimensions based on device pixel ratio.
   */
  private calculateDimensions() {
    const pr = this.devicePixelRatio;
    return {
      width: PANEL_CONFIG.WIDTH * pr,
      height: PANEL_CONFIG.HEIGHT * pr,
      textX: PANEL_CONFIG.TEXT_PADDING * pr,
      textY: PANEL_CONFIG.TEXT_Y_OFFSET * pr,
      graphX: PANEL_CONFIG.TEXT_PADDING * pr,
      graphY: PANEL_CONFIG.GRAPH_Y_OFFSET * pr,
      graphWidth: PANEL_CONFIG.GRAPH_WIDTH * pr,
      graphHeight: PANEL_CONFIG.GRAPH_HEIGHT * pr,
    };
  }

  /**
   * Creates the canvas element.
   */
  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.dimensions.width;
    canvas.height = this.dimensions.height;
    canvas.style.cssText = `width:${PANEL_CONFIG.WIDTH}px;height:${PANEL_CONFIG.HEIGHT}px`;
    return canvas;
  }

  /**
   * Initializes the canvas context.
   */
  private initializeContext(): CanvasRenderingContext2D {
    const ctx = this.dom.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }

    ctx.font = `bold ${PANEL_CONFIG.FONT_SIZE * this.devicePixelRatio}px ${
      PANEL_CONFIG.FONT_FAMILY
    }`;
    ctx.textBaseline = 'top';

    return ctx;
  }

  /**
   * Draws the initial panel background and text.
   */
  private drawInitialPanel(): void {
    const {
      width,
      height,
      textX,
      textY,
      graphX,
      graphY,
      graphWidth,
      graphHeight,
    } = this.dimensions;

    // Draw background
    this.context.fillStyle = this.backgroundColor;
    this.context.fillRect(0, 0, width, height);

    // Draw name
    this.context.fillStyle = this.foregroundColor;
    this.context.fillText(this.name, textX, textY);

    // Draw graph outline
    this.context.fillRect(graphX, graphY, graphWidth, graphHeight);

    // Draw graph background
    this.context.fillStyle = this.backgroundColor;
    this.context.globalAlpha = PANEL_CONFIG.GRAPH_ALPHA;
    this.context.fillRect(graphX, graphY, graphWidth, graphHeight);
    this.context.globalAlpha = 1;
  }

  /**
   * Updates min and max values.
   */
  private updateMinMax(value: number): void {
    this.minValue = Math.min(this.minValue, value);
    this.maxValue = Math.max(this.maxValue, value);
  }

  /**
   * Clears the text area for redrawing.
   */
  private clearTextArea(): void {
    const { width, graphY } = this.dimensions;
    this.context.fillStyle = this.backgroundColor;
    this.context.fillRect(0, 0, width, graphY);
  }

  /**
   * Draws the current value text.
   */
  private drawText(value: number): void {
    const { textX, textY } = this.dimensions;
    const text = this.formatText(value);

    this.context.fillStyle = this.foregroundColor;
    this.context.fillText(text, textX, textY);
  }

  /**
   * Formats the display text.
   */
  private formatText(value: number): string {
    const roundedValue = Math.round(value);
    const roundedMin = Math.round(this.minValue);
    const roundedMax = Math.round(this.maxValue);
    return `${roundedValue} ${this.name} (${roundedMin}-${roundedMax})`;
  }

  /**
   * Scrolls the graph to the left.
   */
  private scrollGraph(): void {
    const { graphX, graphY, graphWidth, graphHeight } = this.dimensions;
    const pr = this.devicePixelRatio;

    this.context.drawImage(
      this.dom,
      graphX + pr,
      graphY,
      graphWidth - pr,
      graphHeight,
      graphX,
      graphY,
      graphWidth - pr,
      graphHeight
    );
  }

  /**
   * Draws the new value on the graph.
   */
  private drawNewValue(value: number, maxValue: number): void {
    const { graphX, graphY, graphWidth, graphHeight } = this.dimensions;
    const pr = this.devicePixelRatio;
    const x = graphX + graphWidth - pr;

    // Draw full height bar in foreground color
    this.context.fillStyle = this.foregroundColor;
    this.context.fillRect(x, graphY, pr, graphHeight);

    // Draw partial height bar in background color
    const normalizedHeight = Math.round((1 - value / maxValue) * graphHeight);
    this.context.fillStyle = this.backgroundColor;
    this.context.globalAlpha = PANEL_CONFIG.GRAPH_ALPHA;
    this.context.fillRect(x, graphY, pr, normalizedHeight);
    this.context.globalAlpha = 1;
  }
}
