// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement } from './../../index';

export default class PetThresholdTool extends BaseTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'PetThreshold',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        maxSUV: 5,
      },
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

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt) {
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { scene } = enabledElement;

    const { volumeUID, maxSUV } = this._configuration;

    console.log('PET THRESHOLD');

    let volumeActor;

    if (volumeUID) {
      volumeActor = scene.getVolumeActor(volumeUID);

      if (!volumeActor) {
        // Intentional use of volumeUID which is not defined
      }
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

    const { y: deltaY } = deltaPoints.canvas;
    const multiplier = 5 / canvas.clientHeight;
    const wcDelta = deltaY * multiplier;
    let [lower, upper] = rgbTransferFunction.getRange();

    upper += wcDelta;
    upper = Math.max(Math.min(upper, maxSUV), 0.1);

    rgbTransferFunction.setMappingRange(lower, upper);

    scene.render();
  }
}
