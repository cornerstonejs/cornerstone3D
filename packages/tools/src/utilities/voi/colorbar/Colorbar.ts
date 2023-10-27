import { IColorMapPreset } from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import { vec2 } from 'gl-matrix';
import { utilities as csUtils, Types } from '@cornerstonejs/core';
import type { ColorbarProps, ColorbarVOIRange } from './types';
import { isRangeValid, areColorbarRangesEqual } from './common';
import { ColorbarRangeTextPosition } from './enums/ColorbarRangeTextPosition';
import { ColorbarCanvas } from './ColorbarCanvas';
import { ColorbarTicks } from './ColorbarTicks';
import isRangeTextPositionValid from './common/isRangeTextPositionValid';
import Widget from '../../../widgets/Widget';

const DEFAULTS = {
  MULTIPLIER: 1,
  RANGE_TEXT_POSITION: ColorbarRangeTextPosition.Right,
  TICKS_BAR_SIZE: 50,
};

type ColorbarPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

/**
 * A base colorbar class that is not associated with any viewport. It is
 * possible to click and drag to change the VOI range, shows the ticks during
 * interaction and it can show full image range or VOI range.
 */
class Colorbar extends Widget {
  private _colormaps: Map<string, IColorMapPreset>;
  private _activeColormapName: string;
  private _eventListenersManager: csUtils.eventListener.MultiTargetEventListenerManager;
  private _canvas: ColorbarCanvas;
  private _ticksBar: ColorbarTicks;
  private _rangeTextPosition: ColorbarRangeTextPosition;

  private _isMouseOver = false;
  private _isInteracting = false;

  constructor(props: ColorbarProps) {
    super(props);

    this._eventListenersManager =
      new csUtils.eventListener.MultiTargetEventListenerManager();
    this._colormaps = Colorbar.getColormapsMap(props);
    this._activeColormapName = Colorbar.getInitialColormapName(props);
    this._canvas = this._createCanvas(props);
    this._ticksBar = this._createTicksBar(props);
    this._rangeTextPosition =
      props.ticks?.position ?? DEFAULTS.RANGE_TEXT_POSITION;

    this._canvas.appendTo(this.rootElement);
    this._ticksBar.appendTo(this.rootElement);

    this._addRootElementEventListeners();
  }

  /**
   * Returns the active LUT name
   */
  public get activeColormapName() {
    return this._activeColormapName;
  }

  /**
   * Set the current active LUT name and re-renders the color bar
   */
  public set activeColormapName(colormapName: string) {
    if (colormapName === this._activeColormapName) {
      return;
    }

    const colormap = this._colormaps.get(colormapName);

    if (!colormap) {
      console.warn(`Invalid colormap name (${colormapName})`);
      return;
    }

    this._activeColormapName = colormapName;
    this._canvas.colormap = colormap;
  }

  public get imageRange() {
    return this._canvas.imageRange;
  }

  public set imageRange(imageRange: ColorbarVOIRange) {
    this._canvas.imageRange = imageRange;
    this._ticksBar.imageRange = imageRange;
  }

  public get voiRange() {
    return this._canvas.voiRange;
  }

  public set voiRange(voiRange: ColorbarVOIRange) {
    const { voiRange: currentVoiRange } = this._canvas;

    if (
      !isRangeValid(voiRange) ||
      areColorbarRangesEqual(voiRange, currentVoiRange)
    ) {
      return;
    }

    this._canvas.voiRange = voiRange;
    this._ticksBar.voiRange = voiRange;
    this.onVoiChange(voiRange);
  }

  public get showFullImageRange() {
    return this._canvas.showFullImageRange;
  }

  public set showFullImageRange(value: boolean) {
    this._canvas.showFullImageRange = value;
    this._ticksBar.showFullPixelValueRange = value;
  }

  public destroy() {
    super.destroy();
    this._eventListenersManager.reset();
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      position: 'relative',
      fontSize: '0',
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  protected onContainerResize() {
    super.onContainerResize();
    this.updateTicksBar();
    this._canvas.size = this.containerSize;
  }

  protected getVOIMultipliers(): [number, number] {
    return [DEFAULTS.MULTIPLIER, DEFAULTS.MULTIPLIER];
  }

  protected onVoiChange(voiRange: ColorbarVOIRange) {
    // no-op
  }

  protected showTicks() {
    this.updateTicksBar();
    this._ticksBar.visible = true;
  }

  protected hideTicks() {
    if (this._isInteracting || this._isMouseOver) {
      return;
    }

    this._ticksBar.visible = false;
  }

  private static getColormapsMap(props: ColorbarProps) {
    const { colormaps } = props;

    return colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, IColorMapPreset>()
    );
  }

  private static getInitialColormapName(props: ColorbarProps) {
    const { activeColormapName, colormaps } = props;
    const colormapExists =
      !!activeColormapName &&
      colormaps.some((cm) => cm.Name === activeColormapName);

    return colormapExists ? activeColormapName : colormaps[0].Name;
  }

  private _createCanvas(props: ColorbarProps) {
    const { imageRange, voiRange, showFullPixelValueRange } = props;
    const colormap = this._colormaps.get(this._activeColormapName);

    return new ColorbarCanvas({
      colormap,
      imageRange,
      voiRange: voiRange,
      showFullPixelValueRange,
    });
  }

  public _createTicksBar(props: ColorbarProps): ColorbarTicks {
    const ticksProps = props.ticks;

    return new ColorbarTicks({
      imageRange: props.imageRange,
      voiRange: props.voiRange,
      ticks: ticksProps,
      showFullPixelValueRange: props.showFullPixelValueRange,
    });
  }

  private _getPointsFromMouseEvent(evt: MouseEvent): ColorbarPoints {
    const { rootElement: element } = this;
    const clientPoint: Types.Point2 = [evt.clientX, evt.clientY];
    const pagePoint: Types.Point2 = [evt.pageX, evt.pageY];
    const rect = element.getBoundingClientRect();
    const localPoints: Types.Point2 = [
      pagePoint[0] - rect.left - window.pageXOffset,
      pagePoint[1] - rect.top - window.pageYOffset,
    ];

    return { client: clientPoint, page: pagePoint, local: localPoints };
  }

  private updateTicksBar() {
    const { width: containerWidth, height: containerHeight } =
      this.containerSize;

    // ResizeObserver have not triggered any event when this happen
    if (containerWidth === 0 && containerHeight === 0) {
      return;
    }

    const { _ticksBar: ticksBar, _rangeTextPosition: rangeTextPosition } = this;
    const isHorizontal = containerWidth >= containerHeight;
    const width = isHorizontal ? containerWidth : DEFAULTS.TICKS_BAR_SIZE;
    const height = isHorizontal ? DEFAULTS.TICKS_BAR_SIZE : containerHeight;

    if (
      !isRangeTextPositionValid(
        containerWidth,
        containerHeight,
        rangeTextPosition
      )
    ) {
      throw new Error(
        'Invalid rangeTextPosition value for the current colobar orientation'
      );
    }

    let ticksBarTop;
    let ticksBarLeft;

    ticksBar.size = { width, height };

    if (isHorizontal) {
      ticksBarLeft = 0;
      ticksBarTop =
        rangeTextPosition === ColorbarRangeTextPosition.Top
          ? -height
          : containerHeight;
    } else {
      ticksBarTop = 0;
      ticksBarLeft =
        rangeTextPosition === ColorbarRangeTextPosition.Left
          ? -width
          : containerWidth;
    }

    ticksBar.top = ticksBarTop;
    ticksBar.left = ticksBarLeft;
  }

  private _mouseOverCallback = (evt) => {
    this._isMouseOver = true;
    this.showTicks();
    evt.stopPropagation();
  };

  private _mouseOutCallback = (evt) => {
    this._isMouseOver = false;
    this.hideTicks();
    evt.stopPropagation();
  };

  private _mouseDownCallback = (evt: MouseEvent) => {
    this._isInteracting = true;
    this.showTicks();
    this._addVOIEventListeners(evt);
    evt.stopPropagation();
  };

  private _mouseDragCallback = (evt, initialState) => {
    const multipliers = this.getVOIMultipliers();
    const currentPoints = this._getPointsFromMouseEvent(evt);
    const { points: startPoints, voiRange: startVOIRange } = initialState;
    const canvasDelta = vec2.sub(
      vec2.create(),
      currentPoints.local,
      startPoints.local
    );

    const wwDelta = canvasDelta[0] * multipliers[0];
    const wcDelta = canvasDelta[1] * multipliers[1];

    if (!wwDelta && !wcDelta) {
      return;
    }

    const { lower: voiLower, upper: voiUpper } = startVOIRange;
    let { windowWidth, windowCenter } = csUtils.windowLevel.toWindowLevel(
      voiLower,
      voiUpper
    );

    windowWidth = Math.max(windowWidth + wwDelta, 1);
    windowCenter += wcDelta;

    const newVoiRange = csUtils.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    );

    this.voiRange = newVoiRange;
    evt.stopPropagation();
    evt.preventDefault();
  };

  private _mouseUpCallback = (evt) => {
    this._isInteracting = false;
    this.hideTicks();
    this._removeVOIEventListeners();
    evt.stopPropagation();
  };

  private _addRootElementEventListeners() {
    const { _eventListenersManager: manager } = this;
    const { rootElement: element } = this;

    manager.addEventListener(element, 'mouseover', this._mouseOverCallback);
    manager.addEventListener(element, 'mouseout', this._mouseOutCallback);
    manager.addEventListener(
      element,
      'mousedown',
      this._mouseDownCallback as EventListener
    );
  }

  private _addVOIEventListeners(evt: MouseEvent) {
    const { _eventListenersManager: manager } = this;
    const points = this._getPointsFromMouseEvent(evt);
    const voiRange = { ...this._canvas.voiRange };
    const initialDragState = { points, voiRange };

    this._removeVOIEventListeners();

    manager.addEventListener(document, 'voi.mouseup', this._mouseUpCallback);
    manager.addEventListener(document, 'voi.mousemove', (evt) =>
      this._mouseDragCallback(evt, initialDragState)
    );
  }

  private _removeVOIEventListeners() {
    const { _eventListenersManager: manager } = this;

    manager.removeEventListener(document, 'voi.mouseup');
    manager.removeEventListener(document, 'voi.mousemove');
  }
}

export { Colorbar as default, Colorbar };
