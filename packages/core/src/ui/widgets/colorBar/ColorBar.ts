import { vec2 } from 'gl-matrix';
import { utilities, Types } from '@cornerstonejs/core';
import { EventListenersManager } from './EventListeners';
import { Widget } from '../Widget';
import { ColorBarProps, ColorBarVOIRange, Colormap } from './types';
import ColorBarCanvas from './ColorBarCanvas';
import ColorBarScale from './ColorBarScale';
import isRangeValid from './common/isRangeValid';
import rangesEqual from './common/rangesEqual';
import { ColorBarScalePosition } from './enums/ColorBarScalePosition';

const DEFAULT_MULTIPLIER = 1;
const DEFAULT_SCALE_BAR_POSITION = ColorBarScalePosition.BottomOrRight;
const SCALE_BAR_SIZE = 50;

type ColorBarPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

class ColorBar extends Widget {
  private _colormaps: Map<string, Colormap>;
  private _activeColormapName: string;
  private _eventListenersManager: EventListenersManager;
  private _canvas: ColorBarCanvas;
  private _scaleBar: ColorBarScale;
  private _scalePosition: ColorBarScalePosition;
  private _isInteracting = false;

  constructor(props: ColorBarProps) {
    super(props);

    this._eventListenersManager = new EventListenersManager();
    this._colormaps = ColorBar.getColormapsMap(props);
    this._activeColormapName = ColorBar.getInitialColormapName(props);
    this._canvas = this._createCanvas(props);
    this._scaleBar = this._createScaleBar(props);
    this._scalePosition = props.scalePosition ?? DEFAULT_SCALE_BAR_POSITION;

    this._canvas.appendTo(this.rootElement);
    this._scaleBar.appendTo(document.body);

    this._addRootElementEventListeners();
  }

  private static getColormapsMap(props: ColorBarProps) {
    const { colormaps } = props;

    return colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Colormap>()
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

  public get range() {
    return this._canvas.range;
  }

  public set range(range: ColorBarVOIRange) {
    this._canvas.range = range;
    this._scaleBar.range = range;
  }

  public get voiRange() {
    return this._canvas.voiRange;
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    const { voiRange: currentVoiRange } = this._canvas;

    if (!isRangeValid(voiRange) || rangesEqual(voiRange, currentVoiRange)) {
      return;
    }

    this._canvas.voiRange = voiRange;
    this._scaleBar.voiRange = voiRange;
    this.voiChanged(voiRange);
  }

  public get showFullPixelValueRange() {
    return this._canvas.showFullPixelValueRange;
  }

  public set showFullPixelValueRange(value: boolean) {
    this._canvas.showFullPixelValueRange = value;
    this._scaleBar.showFullPixelValueRange = value;
  }

  public dispose() {
    super.dispose();
    this._removeRootElementEventListeners();
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  protected containerResized() {
    super.containerResized();
    this._canvas.size = this.containerSize;
  }

  protected getVOIMultipliers(): [number, number] {
    return [DEFAULT_MULTIPLIER, DEFAULT_MULTIPLIER];
  }

  protected voiChanged(voiRange: ColorBarVOIRange) {
    // TODO: override voiRange property?
  }

  private _createCanvas(props: ColorBarProps) {
    const { range, voiRange, showFullPixelValueRange } = props;
    const colormap = this._colormaps.get(this._activeColormapName);

    return new ColorBarCanvas({
      colormap,
      range: range,
      voiRange: voiRange,
      showFullPixelValueRange,
    });
  }

  public _createScaleBar(props: ColorBarProps): ColorBarScale {
    return new ColorBarScale({
      range: props.range,
      voiRange: props.voiRange,
      scaleStyle: props.scaleStyle,
      scalePosition: props.scalePosition,
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

  private showScaleBar() {
    const { _scaleBar: scaleBar } = this;
    const { width: containerWidth, height: containerHeight } =
      this.containerSize;
    const { top: containerTop, left: containerLeft } =
      this.rootElement.getBoundingClientRect();
    const isHorizontal = containerWidth >= containerHeight;
    const width = isHorizontal ? containerWidth : SCALE_BAR_SIZE;
    const height = isHorizontal ? SCALE_BAR_SIZE : containerHeight;

    let scaleBarTop;
    let scaleBarLeft;

    scaleBar.size = { width, height };

    if (isHorizontal) {
      scaleBarTop =
        this._scalePosition === ColorBarScalePosition.TopOrLeft
          ? containerTop - height
          : containerTop + containerHeight;

      scaleBarLeft = containerLeft;
    } else {
      scaleBarTop = containerTop;

      scaleBarLeft =
        this._scalePosition === ColorBarScalePosition.TopOrLeft
          ? containerLeft - width
          : containerLeft + containerWidth;
    }

    scaleBar.position = { top: scaleBarTop, left: scaleBarLeft };
    scaleBar.visible = true;
  }

  private _mouseOverCallback = (evt) => {
    this.showScaleBar();
    evt.stopPropagation();
  };

  private _mouseOutCallback = (evt) => {
    if (!this._isInteracting) {
      this._scaleBar.visible = false;
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
  };

  private _mouseUpCallback = (evt) => {
    this._isInteracting = false;
    this._removeVOIEventListeners();
    evt.stopPropagation();
  };

  private _addRootElementEventListeners() {
    const { rootElement: element } = this;

    this._removeRootElementEventListeners();
    element.addEventListener('mouseover', this._mouseOverCallback);
    element.addEventListener('mouseout', this._mouseOutCallback);
    element.addEventListener('mousedown', this._mouseDownCallback);
  }

  private _removeRootElementEventListeners() {
    const { rootElement: element } = this;

    element.removeEventListener('mouseover', this._mouseOverCallback);
    element.removeEventListener('mouseout', this._mouseOutCallback);
    element.removeEventListener('mousedown', this._mouseDownCallback);
  }

  private _addVOIEventListeners(evt: MouseEvent) {
    const { _eventListenersManager: manager } = this;
    const points = this._getPointsFromMouseEvent(evt);
    const voiRange = { ...this._canvas.voiRange };
    const initialDragState = { points, voiRange };

    this._removeVOIEventListeners();

    document.addEventListener('mouseup', this._mouseUpCallback);
    manager.addEventListener(document, 'colorbar.voi.mousemove', (evt) =>
      this._mouseDragCallback(evt, initialDragState)
    );
  }

  private _removeVOIEventListeners() {
    const { _eventListenersManager: manager } = this;

    document.removeEventListener('mouseup', this._mouseUpCallback);
    manager.removeEventListener(document, 'colorbar.voi.mousemove');
  }
}

export { ColorBar as default, ColorBar };
