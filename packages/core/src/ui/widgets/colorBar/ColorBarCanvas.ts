import { utilities } from '@cornerstonejs/core';
import { ColorBarRange, ColorBarVOIRange, Colormap } from './types';
import { ColorBarCanvasProps } from './types/ColormapCanvasProps';
import { ColorBarSize } from './types/ColorBarSize';
import isRangeValid from './common/isRangeValid';
import rangesEqual from './common/rangesEqual';
import isSizeValid from './common/isSizeValid';
import sizesEqual from './common/sizesEqual';

const clamp = (value, min, max) => Math.min(Math.max(min, value), max);

const interpolateVec3 = (a, b, t) => {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
};

class ColorBarCanvas {
  private _canvas: HTMLCanvasElement;
  private _range: ColorBarRange;
  private _voiRange: ColorBarVOIRange;
  private _colormap: Colormap;
  private _showFullPixelValueRange: boolean;

  constructor(props: ColorBarCanvasProps) {
    ColorBarCanvas.validateProps(props);

    const {
      colormap,
      size = { width: 20, height: 100 },
      range = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      container,
      showFullPixelValueRange = false,
    } = props;

    this._colormap = colormap;
    this._range = range;
    this._voiRange = voiRange;
    this._showFullPixelValueRange = showFullPixelValueRange;
    this._canvas = this._createRootElement(size);

    if (container) {
      this.appendTo(container);
    }
  }

  public get colormap(): Colormap {
    return this._colormap;
  }

  public set colormap(colormap: Colormap) {
    this._colormap = colormap;
    this.render();
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

  public get range(): ColorBarRange {
    return { ...this._range };
  }

  public set range(range: ColorBarRange) {
    if (!isRangeValid(range) || rangesEqual(range, this._range)) {
      return;
    }

    this._range = range;
    this.render();
  }

  public get voiRange(): ColorBarVOIRange {
    return { ...this._voiRange };
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    if (!isRangeValid(voiRange) || rangesEqual(voiRange, this._voiRange)) {
      return;
    }

    this._voiRange = voiRange;
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

  public appendTo(container: HTMLElement) {
    container.appendChild(this._canvas);
    this.render();
  }

  public dispose() {
    const { _canvas: canvas } = this;
    const { parentElement } = canvas;

    parentElement?.removeChild(canvas);
  }

  private static validateProps(props: ColorBarCanvasProps) {
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

  private _createRootElement(size: ColorBarSize) {
    const canvas = document.createElement('canvas');

    Object.assign(canvas.style, {
      pointerEvents: 'none',
      boxSizing: 'border-box',
    });

    this._setCanvasSize(canvas, size);

    return canvas;
  }

  private render(): void {
    if (!this._canvas.isConnected) {
      return;
    }

    const { _colormap: colormap } = this;
    const { RGBPoints: rgbPoints } = colormap;
    const colorsCount = rgbPoints.length / 4;

    const getColorPoint = (index) => {
      const offset = 4 * index;

      if (index < 0 || index >= colorsCount) {
        return;
      }

      return {
        index,
        position: rgbPoints[offset],
        color: [
          rgbPoints[offset + 1],
          rgbPoints[offset + 2],
          rgbPoints[offset + 3],
        ],
      };
    };

    const { width, height } = this._canvas;
    const canvasContext = this._canvas.getContext('2d');
    const isHorizontal = width > height;
    const maxValue = isHorizontal ? width : height;
    const { _voiRange: voiRange } = this;
    const range = this._showFullPixelValueRange ? this._range : { ...voiRange };

    const { windowWidth } = utilities.windowLevel.toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );

    let previousColorPoint = undefined;
    let currentColorPoint = getColorPoint(0);

    const incRawPixelValue = (range.upper - range.lower) / (maxValue - 1);
    let rawPixelValue = range.lower;

    for (let i = 0; i < maxValue; i++) {
      const tVoiRange = (rawPixelValue - voiRange.lower) / windowWidth;

      // Find the color in a linear way (O(n) complexity).
      // currentColorPoint shall move to the next color until tVoiRange is smaller
      // than or equal to next color position.
      if (currentColorPoint) {
        for (let i = currentColorPoint.index; i < colorsCount; i++) {
          if (tVoiRange <= currentColorPoint.position) {
            break;
          }

          previousColorPoint = currentColorPoint;
          currentColorPoint = getColorPoint(i + 1);
        }
      }

      let normColor;

      // For:
      //   - firstColorPoint = getColorPoint(0)
      //   - secondColorPoint = getColorPoint(1)
      //   - lastColorPoint = getColorPoint(colorsCount - 1)
      // Then
      //   - previousColorPoint shall be undefined when tVoiRange < firstColorPoint.position
      //   - currentColorPoint shall be undefined when tVoiRange > lastColorPoint.position
      //   - previousColorPoint and currentColorPoint will be defined when
      //     currentColorPoint.position is between secondColorPoint.position and
      //     lastColorPoint.position.
      if (!previousColorPoint) {
        normColor = [...currentColorPoint.color];
      } else if (!currentColorPoint) {
        normColor = [...previousColorPoint.color];
      } else {
        const tColorRange =
          (tVoiRange - previousColorPoint.position) /
          (currentColorPoint.position - previousColorPoint.position);

        normColor = interpolateVec3(
          previousColorPoint.color,
          currentColorPoint.color,
          tColorRange
        );
      }

      const color = normColor.map((color) =>
        clamp(Math.round(color * 255), 0, 255)
      );

      canvasContext.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

      if (isHorizontal) {
        canvasContext.fillRect(i, 0, 1, height);
      } else {
        canvasContext.fillRect(0, height - i - 1, width, 1);
      }

      rawPixelValue += incRawPixelValue;
    }
  }
}

export { ColorBarCanvas as default, ColorBarCanvas };
