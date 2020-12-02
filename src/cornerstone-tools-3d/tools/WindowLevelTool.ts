// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement } from './../../index';

export default class WindowLevelTool extends BaseTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'WindowLevel',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    };

    super(toolConfiguration, defaultToolConfiguration);

    /**
     * Will only fire for cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  private _toWindowLevel(low, high) {
    const windowWidth = Math.abs(low - high);
    const windowCenter = low + windowWidth / 2;

    return { windowWidth, windowCenter };
  }

  private _toLowHighRange(windowWidth, windowCenter) {
    const lower = windowCenter - windowWidth / 2.0;
    const upper = windowCenter + windowWidth / 2.0;

    return { lower, upper };
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { scene } = enabledElement;

    const { volumeUID } = this._configuration;

    let volumeActor;

    if (volumeUID) {
      volumeActor = scene.getVolumeActor(volumeUID);
    } else {
      // Default to first volumeActor
      const volumeActors = scene.getVolumeActors();

      if (volumeActors && volumeActors.length) {
        volumeActor = volumeActors[0].volumeActor;
      }
    }

    if (!volumeActor) {
      // No volume actor available.
      return;
    }

    const rgbTransferFunction = volumeActor
      .getProperty()
      .getRGBTransferFunction(0);

    const { x: deltaX, y: deltaY } = deltaPoints.canvas;

    const range = volumeActor
      .getMapper()
      .getInputData()
      .getPointData()
      .getScalars()
      .getRange();

    const imageDynamicRange = range[1] - range[0];
    const multiplier = Math.round(imageDynamicRange / 1024);

    const wwDelta = deltaX * multiplier;
    const wcDelta = deltaY * multiplier;

    let [lower, upper] = rgbTransferFunction.getRange();

    let { windowWidth, windowCenter } = this._toWindowLevel(lower, upper);

    windowWidth += wwDelta;
    windowCenter += wcDelta;

    // Convert back to range
    const newRange = this._toLowHighRange(windowWidth, windowCenter);

    rgbTransferFunction.setMappingRange(newRange.lower, newRange.upper);

    scene.render();
  }
}
