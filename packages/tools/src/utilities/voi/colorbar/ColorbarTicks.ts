import type {
  ColorbarImageRange,
  ColorbarVOIRange,
  ColorbarSize,
  ColorbarTicksProps,
} from './types';
import {
  isColorbarSizeValid,
  isRangeValid,
  areColorbarRangesEqual,
  areColorbarSizesEqual,
} from './common';
import { ColorbarRangeTextPosition } from './enums/ColorbarRangeTextPosition';

const DEFAULTS = {
  FONT: '10px Arial',
  COLOR: 'white',
  TICK_SIZE: 5,
  TICK_WIDTH: 1,
  TICK_LABEL_MARGIN: 3,
  MAX_NUM_TICKS: 8,

  // Must start with 1 and end with 10
  TICKS_STEPS: [1, 2.5, 5, 10],
};

class ColorbarTicks {
  private _canvas: HTMLCanvasElement;
  private _imageRange: ColorbarImageRange;
  private _voiRange: ColorbarVOIRange;
  private _color: string;
  private _tickSize: number;
  private _tickWidth: number;
  private _labelMargin: number;
  private _maxNumTicks: number;
  private _rangeTextPosition: ColorbarRangeTextPosition;
  private _showFullPixelValueRange: boolean;
  private _font: string;

  constructor(props: ColorbarTicksProps) {
    ColorbarTicks.validateProps(props);

    const {
      top = 0,
      left = 0,
      size = { width: 20, height: 100 },
      imageRange = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      ticks: ticksProps,
      container,
      showFullPixelValueRange = false,
    } = props;

    const { style: ticksStyle, position: rangeTextPosition } = ticksProps ?? {};

    this._imageRange = imageRange;
    this._voiRange = voiRange;
    this._font = ticksStyle?.font ?? DEFAULTS.FONT;
    this._color = ticksStyle?.color ?? DEFAULTS.COLOR;
    this._tickSize = ticksStyle?.tickSize ?? DEFAULTS.TICK_SIZE;
    this._tickWidth = ticksStyle?.tickWidth ?? DEFAULTS.TICK_WIDTH;
    this._labelMargin = ticksStyle?.labelMargin ?? DEFAULTS.TICK_LABEL_MARGIN;
    this._maxNumTicks = ticksStyle?.maxNumTicks ?? DEFAULTS.MAX_NUM_TICKS;
    this._rangeTextPosition =
      rangeTextPosition ?? ColorbarRangeTextPosition.Right;
    this._showFullPixelValueRange = showFullPixelValueRange;
    this._canvas = this._createCanvasElement(size, top, left);

    if (container) {
      this.appendTo(container);
    }
  }

  public get size(): ColorbarSize {
    const { width, height } = this._canvas;
    return { width, height };
  }

  public set size(size: ColorbarSize) {
    const { _canvas: canvas } = this;

    if (!isColorbarSizeValid(size) || areColorbarSizesEqual(canvas, size)) {
      return;
    }

    this._setCanvasSize(canvas, size);
    this.render();
  }

  /**
   * Canvas top position (pixels)
   */
  public get top(): number {
    return Number.parseInt(this._canvas.style.top);
  }

  /**
   * Change the canvas top position (pixels)
   */
  public set top(top: number) {
    const { _canvas: canvas } = this;
    const currentTop = this.top;

    if (top === currentTop) {
      return;
    }

    canvas.style.top = `${top}px`;
    this.render();
  }

  /**
   * Canvas left position (pixels)
   */
  public get left(): number {
    return Number.parseInt(this._canvas.style.left);
  }

  /**
   * Change the canvas left position (pixels)
   */
  public set left(left: number) {
    const { _canvas: canvas } = this;
    const currentLeft = this.left;

    if (left === currentLeft) {
      return;
    }

    canvas.style.left = `${left}px`;
    this.render();
  }

  /**
   * Image range
   */
  public get imageRange() {
    return { ...this._imageRange };
  }

  /**
   * Set the image range that should goes from minPixelValue to maxPixelValue
   */
  public set imageRange(imageRange: ColorbarVOIRange) {
    if (
      !isRangeValid(imageRange) ||
      areColorbarRangesEqual(imageRange, this._imageRange)
    ) {
      return;
    }

    this._imageRange = imageRange;
    this.render();
  }

  /**
   * VOI range
   * (lower: wc - ww / 2, upper: wc + ww / 2)
   */
  public get voiRange() {
    return { ...this._voiRange };
  }

  /**
   * Set the VOI Range
   * (lower: wc - ww / 2, upper: wc + ww / 2)
   */
  public set voiRange(voiRange: ColorbarVOIRange) {
    if (
      !isRangeValid(voiRange) ||
      areColorbarRangesEqual(voiRange, this._voiRange)
    ) {
      return;
    }

    this._voiRange = voiRange;
    this.render();
  }

  /**
   * Tick size (pixels)
   */
  public get tickSize(): number {
    return this._tickSize;
  }

  /**
   * Set the tick size
   */
  public set tickSize(tickSize: number) {
    if (tickSize === this._tickSize) {
      return;
    }

    this._tickSize = tickSize;
    this.render();
  }

  /**
   * Tick width (pixels)
   */
  public get tickWidth(): number {
    return this._tickWidth;
  }

  /**
   * Set the tick width. This width is used as `lineWidth` by CanvasRenderingContext2D.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineWidth
   */
  public set tickWidth(tickWidth: number) {
    if (tickWidth === this._tickWidth) {
      return;
    }

    this._tickWidth = tickWidth;
    this.render();
  }

  /**
   * Color used for ticks and labels.
   */
  public get color(): string {
    return this._color;
  }

  /**
   * Set the color used for ticks and labels. This color is used as `strokeStyle`
   * and `fillStyle` by CanvasRenderingContext2D.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle
   * https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeStyle
   */
  public set color(color: string) {
    if (color === this._color) {
      return;
    }

    this._color = color;
    this.render();
  }

  /**
   * Return `true` when the ticks displayed are in the range from `imageRange.lower`
   * to `imageRange.upper` or `false` when they are in the range from `voiRange.lower`
   * to `voiRange.upper`
   */
  public get showFullPixelValueRange(): boolean {
    return this._showFullPixelValueRange;
  }

  /**
   * Change which range should be used when rendering the ticks. Set it to `true`
   * to show from `imageRange.lower` to `imageRange.upper` or `false` show from
   * `voiRange.lower` to `voiRange.upper`.
   */
  public set showFullPixelValueRange(showFullRange: boolean) {
    if (showFullRange === this._showFullPixelValueRange) {
      return;
    }

    this._showFullPixelValueRange = showFullRange;
    this.render();
  }

  /**
   * Ticks visibility
   */
  public get visible() {
    return this._canvas.style.display === 'block';
  }

  /**
   * Show/Hide the ticks
   */
  public set visible(visible) {
    if (visible === this.visible) {
      return;
    }

    this._canvas.style.display = visible ? 'block' : 'none';

    if (visible) {
      this.render();
    }
  }

  /**
   * Append the canvas to its parent element
   * @param container - HTML element where the canvas should be added to
   */
  public appendTo(container: HTMLElement) {
    container.appendChild(this._canvas);
    this.render();
  }

  private static validateProps(props: ColorbarTicksProps) {
    const { size, imageRange, voiRange } = props;

    if (size && !isColorbarSizeValid(size)) {
      throw new Error('Invalid "size"');
    }

    if (imageRange && !isRangeValid(imageRange)) {
      throw new Error('Invalid "imageRange"');
    }

    if (voiRange && !isRangeValid(voiRange)) {
      throw new Error('Invalid "voiRange"');
    }
  }

  private _setCanvasSize(canvas: HTMLCanvasElement, size: ColorbarSize) {
    const { width, height } = size;

    canvas.width = width;
    canvas.height = height;

    Object.assign(canvas.style, {
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  private _createCanvasElement(
    size: ColorbarSize,
    top: number,
    left: number
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    Object.assign(canvas.style, {
      display: 'none',
      position: 'absolute',
      boxSizing: 'border-box',
      top: `${top}px`,
      left: `${left}px`,
    });

    this._setCanvasSize(canvas, size);

    return canvas;
  }

  /**
   * Calculate how many ticks can be displayed on the screen based on the
   * pre-defined steps (`TICKS_STEPS`) as follow:
   *   1. Calculate what should be the step (`roughStep`) based on the range and
   *   the number of desired steps (`maxNumTicks`).
   *   2. Find a number power of 10 (eg: 0.1, 1, 10, 100, etc.) that can be used
   *   to multiply `roughStep` and return a number between 1 and 10 which is
   *   called `roughtStepNormalized`.
   *   3. Find in the TICKS_STEPS array a number that is bigger than or equal to
   *   the `roughtStepNormalized` value (`normalizedStep`).
   *   4. Multiply the `normalizedStep` to move it to the real range.
   *
   * @param range - Range with "lower" and "upper" values
   */
  private _getTicks(range) {
    const { lower, upper } = range;
    const rangeValue = upper - lower;

    // First approximation based on the max number of ticks
    const roughStep = rangeValue / (this._maxNumTicks - 1);

    // Normalize rough step to find the normalized one that fits best
    const stepPower = Math.pow(
      10,
      -Math.floor(Math.log10(Math.abs(roughStep)))
    );

    // Get a number between 1 and 10
    const roughtStepNormalized = roughStep * stepPower;

    // Find a normalize step that is greater than or equal to `roughtStepNormalized`
    const normalizedStep = DEFAULTS.TICKS_STEPS.find(
      (n) => n >= roughtStepNormalized
    );

    // Move `normalizedStep` to the real range
    const step = normalizedStep / stepPower;

    // Determine the scale limits based on the chosen step.
    const scaleMax = Math.ceil(upper / step) * step;
    const scaleMin = Math.floor(lower / step) * step;

    // Find a possible tick values for the `step` computed
    const ticksCount = Math.round((scaleMax - scaleMin) / step) + 1;
    const ticks = [];

    for (let i = 0; i < ticksCount; i++) {
      ticks.push(scaleMin + i * step);
    }

    return { scaleMin, scaleMax, step, ticks };
  }

  private _getLeftTickInfo({ position, labelMeasure }) {
    const { width } = this._canvas;
    const labelX =
      width - this.tickSize - labelMeasure.width - this._labelMargin;
    const labelPoint = [labelX, position];
    const tickPoints = {
      start: [width - this._tickSize, position],
      end: [width, position],
    };

    return { labelPoint, tickPoints };
  }

  private _getRightTickInfo({ position }) {
    const labelPoint = [this._tickSize + this._labelMargin, position];
    const tickPoints = {
      start: [0, position],
      end: [this._tickSize, position],
    };

    return { labelPoint, tickPoints };
  }

  private _getTopTickInfo({ position, labelMeasure }) {
    throw new Error('Not implemented');
  }

  private _getBottomTickInfo({ position, labelMeasure }) {
    throw new Error('Not implemented');
  }

  private render() {
    const { _canvas: canvas } = this;

    if (!canvas.isConnected || !this.visible) {
      return;
    }

    const { width, height } = canvas;
    const isHorizontal = width >= height;
    const maxCanvasPixelValue = isHorizontal ? width : height;
    const canvasContext = canvas.getContext('2d');
    const { _voiRange: voiRange } = this;
    const range = this._showFullPixelValueRange
      ? this._imageRange
      : { ...voiRange };
    const rangeWidth = range.upper - range.lower;
    const { ticks } = this._getTicks(range);

    canvasContext.clearRect(0, 0, width, height);
    canvasContext.font = this._font;
    canvasContext.textBaseline = 'middle';
    canvasContext.fillStyle = this._color;
    canvasContext.strokeStyle = this._color;
    canvasContext.lineWidth = this.tickWidth;

    ticks.forEach((tick) => {
      let position = Math.round(
        maxCanvasPixelValue * ((tick - range.lower) / rangeWidth)
      );

      // Zero at the bottom and max at the top on vertical colorbars
      if (!isHorizontal) {
        position = height - position;
      }

      if (position < 0 || position > maxCanvasPixelValue) {
        return;
      }

      const label = tick.toString();
      const labelMeasure = canvasContext.measureText(label);
      let tickInfo;

      if (isHorizontal) {
        if (this._rangeTextPosition === ColorbarRangeTextPosition.Top) {
          tickInfo = this._getTopTickInfo({ position, labelMeasure });
        } else {
          tickInfo = this._getBottomTickInfo({ position, labelMeasure });
        }
      } else {
        if (this._rangeTextPosition === ColorbarRangeTextPosition.Left) {
          tickInfo = this._getLeftTickInfo({ position, labelMeasure });
        } else {
          tickInfo = this._getRightTickInfo({ position });
        }
      }

      const { labelPoint, tickPoints } = tickInfo;
      const { start: tickStart, end: tickEnd } = tickPoints;

      canvasContext.beginPath();
      canvasContext.moveTo(tickStart[0], tickStart[1]);
      canvasContext.lineTo(tickEnd[0], tickEnd[1]);
      canvasContext.fillText(label, labelPoint[0], labelPoint[1]);
      canvasContext.stroke();

      return position;
    });
  }
}

export { ColorbarTicks as default, ColorbarTicks };
