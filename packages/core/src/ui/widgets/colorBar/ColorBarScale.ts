import { ColorBarRange } from './types/ColorBarRange';
import { ColorBarVOIRange } from './types/ColorBarVOIRange';
import { ColorBarSize } from './types/ColorBarSize';
import { ColorBarScaleProps } from './types/ColorBarScaleProps';
import { ColorBarPosition } from './types/ColorBarPosition';
import isSizeValid from './common/isSizeValid';
import isRangeValid from './common/isRangeValid';
import rangesEqual from './common/rangesEqual';
import sizesEqual from './common/sizesEqual';
import positionsEqual from './common/positionsEquals';
import { ColorBarScalePosition } from './enums/ColorBarScalePosition';

const DEFAULT_FONT = '10px Arial';
const DEFAULT_COLOR = 'white';
const DEFAULT_TICK_SIZE = 5;
const DEFAULT_TICK_WIDTH = 1;
const DEFAULT_TICK_LABEL_MARGIN = 3;
const DEFAULT_MAX_NUM_TICKS = 8;

class ColorBarScale {
  private _canvas: HTMLCanvasElement;
  private _range: ColorBarRange;
  private _voiRange: ColorBarVOIRange;
  private _color: string;
  private _tickSize: number;
  private _tickWidth: number;
  private _labelMargin: number;
  private _maxNumTicks: number;
  private _scalePosition: ColorBarScalePosition;
  private _showFullPixelValueRange: boolean;
  private _font: string;

  constructor(props: ColorBarScaleProps) {
    ColorBarScale.validateProps(props);

    const {
      size = { width: 20, height: 100 },
      position = { top: 0, left: 0 },
      range = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      scaleStyle,
      scalePosition,
      container,
      showFullPixelValueRange = false,
    } = props;

    this._range = range;
    this._voiRange = voiRange;
    this._font = scaleStyle?.font ?? DEFAULT_FONT;
    this._color = scaleStyle?.color ?? DEFAULT_COLOR;
    this._tickSize = scaleStyle?.tickSize ?? DEFAULT_TICK_SIZE;
    this._tickWidth = scaleStyle?.tickWidth ?? DEFAULT_TICK_WIDTH;
    this._labelMargin = scaleStyle?.labelMargin ?? DEFAULT_TICK_LABEL_MARGIN;
    this._maxNumTicks = scaleStyle?.maxNumTicks ?? DEFAULT_MAX_NUM_TICKS;
    this._scalePosition = scalePosition ?? ColorBarScalePosition.TopOrLeft;
    this._showFullPixelValueRange = showFullPixelValueRange;
    this._canvas = this._createCanvasElement(size, position);

    if (container) {
      this.appendTo(container);
    }
  }

  public get size(): ColorBarSize {
    const { width, height } = this._canvas;
    return { width, height };
  }

  public set size(size: ColorBarSize) {
    const { _canvas: canvas } = this;

    if (!isSizeValid(size) || sizesEqual(canvas, size)) {
      return;
    }

    this._setCanvasSize(canvas, size);
    this.render();
  }

  public get position(): ColorBarPosition {
    return this._getCanvasPosition(this._canvas);
  }

  public set position(position: ColorBarPosition) {
    const { _canvas: canvas } = this;
    const currentPosition = this._getCanvasPosition(canvas);

    if (positionsEqual(position, currentPosition)) {
      return;
    }

    this._setCanvasPosition(canvas, position);
    this.render();
  }

  public get range() {
    return { ...this._range };
  }

  public set range(range: ColorBarVOIRange) {
    if (!isRangeValid(range) || rangesEqual(range, this._range)) {
      return;
    }

    this._range = range;
    this.render();
  }

  public get voiRange() {
    return { ...this._voiRange };
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    if (!isRangeValid(voiRange) || rangesEqual(voiRange, this._voiRange)) {
      return;
    }

    this._voiRange = voiRange;
    this.render();
  }

  public get tickSize(): number {
    return this._tickSize;
  }

  public set tickSize(tickSize: number) {
    if (tickSize === this._tickSize) {
      return;
    }

    this._tickSize = tickSize;
    this.render();
  }

  public get tickWidth(): number {
    return this._tickWidth;
  }

  public set tickWidth(tickWidth: number) {
    if (tickWidth === this._tickWidth) {
      return;
    }

    this._tickWidth = tickWidth;
    this.render();
  }

  public get tickColor(): string {
    return this._color;
  }

  public set tickColor(tickColor: string) {
    if (tickColor === this._color) {
      return;
    }

    this._color = tickColor;
    this.render();
  }

  public get showFullPixelValueRange(): boolean {
    return this._showFullPixelValueRange;
  }

  public set showFullPixelValueRange(showFullRange: boolean) {
    if (showFullRange === this._showFullPixelValueRange) {
      return;
    }

    this._showFullPixelValueRange = showFullRange;
    this.render();
  }

  public get visible() {
    return this._canvas.style.display === 'block';
  }

  public set visible(visible) {
    if (visible === this.visible) {
      return;
    }

    this._canvas.style.display = visible ? 'block' : 'none';

    if (visible) {
      this.render();
    }
  }

  public appendTo(container: HTMLElement) {
    container.appendChild(this._canvas);
    this.render();
  }

  private static validateProps(props: ColorBarScaleProps) {
    const { size, range, voiRange } = props;

    if (size && !isSizeValid(size)) {
      throw new Error('Invalid "size"');
    }

    if (range && !isRangeValid(range)) {
      throw new Error('Invalid "range"');
    }

    if (voiRange && !isRangeValid(voiRange)) {
      throw new Error('Invalid "voiRange"');
    }
  }

  private _setCanvasSize(canvas: HTMLCanvasElement, size: ColorBarSize) {
    const { width, height } = size;

    canvas.width = width;
    canvas.height = height;

    Object.assign(canvas.style, {
      width: `${width}px`,
      height: `${height}px`,
    });
  }

  private _getCanvasPosition(canvas): ColorBarPosition {
    const { top: canvasTop, left: canvasLeft } = this._canvas.style;
    const top = Number.parseInt(canvasTop);
    const left = Number.parseInt(canvasLeft);

    return { top, left };
  }

  private _setCanvasPosition(
    canvas: HTMLCanvasElement,
    position: ColorBarPosition
  ) {
    Object.assign(canvas.style, {
      top: `${position.top}px`,
      left: `${position.left}px`,
    });
  }

  private _createCanvasElement(
    size: ColorBarSize,
    position: ColorBarPosition
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');

    Object.assign(canvas.style, {
      display: 'none',
      position: 'absolute',
      boxSizing: 'border-box',
    });

    this._setCanvasSize(canvas, size);
    this._setCanvasPosition(canvas, position);

    return canvas;
  }

  /**
   * Calculate "ticks" to be displayed for the current range
   * @param range - Range with "lower" and "upper" values
   */
  private _getTicks(range: ColorBarRange) {
    const { lower, upper } = range;
    const rangeValue = upper - lower;

    // First approximation
    const roughStep = rangeValue / (this._maxNumTicks - 1);

    // Set best step for the range
    const goodNormalizedSteps = [1, 2, 5, 10];

    // Normalize rough step to find the normalized one that fits best
    const stepPower = Math.pow(
      10,
      -Math.floor(Math.log10(Math.abs(roughStep)))
    );
    const normalizedStep = roughStep * stepPower;
    const goodNormalizedStep = goodNormalizedSteps.find(
      (n) => n >= normalizedStep
    );
    const step = goodNormalizedStep / stepPower;

    // Determine the scale limits based on the chosen step.
    const scaleMax = Math.ceil(upper / step) * step;
    const scaleMin = Math.floor(lower / step) * step;

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
    const range = this._showFullPixelValueRange ? this._range : { ...voiRange };
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

      // Zero at the bottom and max at the top of the colorBar on vertical colorBar
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
        if (this._scalePosition === ColorBarScalePosition.TopOrLeft) {
          tickInfo = this._getTopTickInfo({ position, labelMeasure });
        } else {
          tickInfo = this._getBottomTickInfo({ position, labelMeasure });
        }
      } else {
        if (this._scalePosition === ColorBarScalePosition.TopOrLeft) {
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

export { ColorBarScale as default, ColorBarScale as ColorBarVOIScale };
