import { vec2 } from 'gl-matrix';
import { utilities, Types } from '@cornerstonejs/core';
import { Widget } from '../Widget';
import type { ColorBarProps, ColorBarVOIRange } from './types';
import { isRangeValid, areColorBarRangesEqual } from './common';
import { ColorBarRangeTextPosition } from './enums/ColorBarRangeTextPosition';
import { ColorBarCanvas } from './ColorBarCanvas';
import ColorBarTicks from './ColorBarTicks';

const { MultiTargetEventListenerManager } = utilities.eventListener;

const DEFAULTS = {
  MULTIPLIER: 1,
  RANGE_TEXT_POSITION: ColorBarRangeTextPosition.BottomOrRight,
  TICKS_BAR_SIZE: 50,
};

type ColorBarPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

class ColorBar extends Widget {
  private _colormaps: Map<string, Types.ColormapRegistration>;
  private _activeColormapName: string;
  private _eventListenersManager: MultiTargetEventListenerManager;
  private _canvas: ColorBarCanvas;
  private _rangeText: ColorBarTicks;
  private _rangeTextPosition: ColorBarRangeTextPosition;
  private _isInteracting = false;

  constructor(props: ColorBarProps) {
    super(props);

    this._eventListenersManager = new MultiTargetEventListenerManager();
    this._colormaps = ColorBar.getColormapsMap(props);
    this._activeColormapName = ColorBar.getInitialColormapName(props);
    this._canvas = this._createCanvas(props);
    this._rangeText = this._createTicksBar(props);
    this._rangeTextPosition =
      props.rangeTextPosition ?? DEFAULTS.RANGE_TEXT_POSITION;

    this._canvas.appendTo(this.rootElement);
    this._rangeText.appendTo(document.body);

    this._addRootElementEventListeners();
  }

  private static getColormapsMap(props: ColorBarProps) {
    const { colormaps } = props;

    return colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Types.ColormapRegistration>()
    );
  }

  private static getInitialColormapName(props: ColorBarProps) {
    const { activeColormapName, colormaps } = props;
    const colormapExists =
      !!activeColormapName &&
      colormaps.some((cm) => cm.Name === activeColormapName);

    return colormapExists ? activeColormapName : colormaps[0].Name;
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

  public set imageRange(imageRange: ColorBarVOIRange) {
    this._canvas.imageRange = imageRange;
    this._rangeText.imageRange = imageRange;
  }

  public get voiRange() {
    return this._canvas.voiRange;
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    const { voiRange: currentVoiRange } = this._canvas;

    if (
      !isRangeValid(voiRange) ||
      areColorBarRangesEqual(voiRange, currentVoiRange)
    ) {
      return;
    }

    this._canvas.voiRange = voiRange;
    this._rangeText.voiRange = voiRange;
    this.onVoiChange(voiRange);
  }

  public get showFullImageRange() {
    return this._canvas.showFullImageRange;
  }

  public set showFullImageRange(value: boolean) {
    this._canvas.showFullImageRange = value;
    this._rangeText.showFullPixelValueRange = value;
  }

  public destroy() {
    super.destroy();
    this._eventListenersManager.reset();
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  protected onContainerResize() {
    super.onContainerResize();
    this._canvas.size = this.containerSize;
  }

  protected getVOIMultipliers(): [number, number] {
    return [DEFAULTS.MULTIPLIER, DEFAULTS.MULTIPLIER];
  }

  protected onVoiChange(voiRange: ColorBarVOIRange) {
    // no-op
  }

  private _createCanvas(props: ColorBarProps) {
    const { imageRange, voiRange, showFullPixelValueRange } = props;
    const colormap = this._colormaps.get(this._activeColormapName);

    return new ColorBarCanvas({
      colormap,
      imageRange,
      voiRange: voiRange,
      showFullPixelValueRange,
    });
  }

  public _createTicksBar(props: ColorBarProps): ColorBarTicks {
    return new ColorBarTicks({
      imageRange: props.imageRange,
      voiRange: props.voiRange,
      ticksStyle: props.ticksStyle,
      rangeTextPosition: props.rangeTextPosition,
      showFullPixelValueRange: props.showFullPixelValueRange,
    });
  }

  private _getPointsFromMouseEvent(evt: MouseEvent): ColorBarPoints {
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

  private showTicksBar() {
    const { _rangeText: ticksBar } = this;
    const { width: containerWidth, height: containerHeight } =
      this.containerSize;
    const { top: containerTop, left: containerLeft } =
      this.rootElement.getBoundingClientRect();
    const isHorizontal = containerWidth >= containerHeight;
    const width = isHorizontal ? containerWidth : DEFAULTS.TICKS_BAR_SIZE;
    const height = isHorizontal ? DEFAULTS.TICKS_BAR_SIZE : containerHeight;

    let ticksBarTop;
    let ticksBarLeft;

    ticksBar.size = { width, height };

    if (isHorizontal) {
      ticksBarTop =
        this._rangeTextPosition === ColorBarRangeTextPosition.TopOrLeft
          ? containerTop - height
          : containerTop + containerHeight;

      ticksBarLeft = containerLeft;
    } else {
      ticksBarTop = containerTop;

      ticksBarLeft =
        this._rangeTextPosition === ColorBarRangeTextPosition.TopOrLeft
          ? containerLeft - width
          : containerLeft + containerWidth;
    }

    ticksBar.top = ticksBarTop;
    ticksBar.left = ticksBarLeft;
    ticksBar.visible = true;
  }

  private _mouseOverCallback = (evt) => {
    this.showTicksBar();
    evt.stopPropagation();
  };

  private _mouseOutCallback = (evt) => {
    if (!this._isInteracting) {
      this._rangeText.visible = false;
    }
    evt.stopPropagation();
  };

  private _mouseDownCallback = (evt: MouseEvent) => {
    this._isInteracting = true;
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
    let { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(
      voiLower,
      voiUpper
    );

    windowWidth = Math.max(windowWidth + wwDelta, 1);
    windowCenter += wcDelta;

    const newVoiRange = utilities.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    );

    this.voiRange = newVoiRange;
    evt.stopPropagation();
    evt.preventDefault();
  };

  private _mouseUpCallback = (evt) => {
    this._isInteracting = false;
    this._removeVOIEventListeners();
    evt.stopPropagation();
  };

  private _addRootElementEventListeners() {
    const { _eventListenersManager: manager } = this;
    const { rootElement: element } = this;

    manager.addEventListener(element, 'mouseover', this._mouseOverCallback);
    manager.addEventListener(element, 'mouseout', this._mouseOutCallback);
    manager.addEventListener(element, 'mousedown', this._mouseDownCallback);
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

export { ColorBar as default, ColorBar };
