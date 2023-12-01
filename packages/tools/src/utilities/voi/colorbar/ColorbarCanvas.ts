import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import { utilities } from '@cornerstonejs/core';
import interpolateVec3 from '../../math/vec3/interpolateVec3';
import { ColorbarCanvasProps } from './types/ColorbarCanvasProps';
import type { ColorbarImageRange, ColorbarVOIRange } from './types';
import type { ColorbarSize } from './types/ColorbarSize';
import {
  isRangeValid,
  areColorbarRangesEqual,
  isColorbarSizeValid,
  areColorbarSizesEqual,
} from './common';

const { clamp } = utilities;

/**
 * Canvas referenced by the color bar where the colormap is rendered. It may
 * show the full image range or only the VOI range.
 */
class ColorbarCanvas {
  private _canvas: HTMLCanvasElement;
  private _imageRange: ColorbarImageRange;
  private _voiRange: ColorbarVOIRange;
  private _colormap: IColorMapPreset;
  private _showFullImageRange: boolean;

  constructor(props: ColorbarCanvasProps) {
    ColorbarCanvas.validateProps(props);

    const {
      colormap,
      size = { width: 20, height: 100 },
      imageRange = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      container,
      showFullPixelValueRange = false,
    } = props;

    this._colormap = colormap;
    this._imageRange = imageRange;
    this._voiRange = voiRange;
    this._showFullImageRange = showFullPixelValueRange;
    this._canvas = this._createRootElement(size);

    if (container) {
      this.appendTo(container);
    }
  }

  public get colormap(): IColorMapPreset {
    return this._colormap;
  }

  public set colormap(colormap: IColorMapPreset) {
    this._colormap = colormap;
    this.render();
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

  public get imageRange(): ColorbarImageRange {
    return { ...this._imageRange };
  }

  public set imageRange(imageRange: ColorbarImageRange) {
    if (
      !isRangeValid(imageRange) ||
      areColorbarRangesEqual(imageRange, this._imageRange)
    ) {
      return;
    }

    this._imageRange = imageRange;
    this.render();
  }

  public get voiRange(): ColorbarVOIRange {
    return { ...this._voiRange };
  }

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

  public get showFullImageRange(): boolean {
    return this._showFullImageRange;
  }

  public set showFullImageRange(showFullImageRange: boolean) {
    if (showFullImageRange === this._showFullImageRange) {
      return;
    }

    this._showFullImageRange = showFullImageRange;
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

  private static validateProps(props: ColorbarCanvasProps) {
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

  private _createRootElement(size: ColorbarSize) {
    const canvas = document.createElement('canvas');

    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
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

    // Returns a color point from rgbPoints. Each point has position, red,
    // green and blue components which means each point has an offset equal
    // to `4 * index`
    const getColorPoint = (index) => {
      const offset = 4 * index;

      // It can get out of bounds when `voiRange.upper` is smaller than
      // `imageRange.upper`. It's also checking if is smaller than zero
      // for safety only because that should never happens.
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
    const range = this._showFullImageRange ? this._imageRange : { ...voiRange };

    const { windowWidth } = utilities.windowLevel.toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );

    let previousColorPoint = undefined;
    let currentColorPoint = getColorPoint(0);

    // Starts from `range.lower` incrementing by incRawPixelValue on each iteration
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

export { ColorbarCanvas as default, ColorbarCanvas };
