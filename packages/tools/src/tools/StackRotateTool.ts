import { getEnabledElement, Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { BaseTool } from './base';
import angleBetweenLines from '../utilities/math/angle/angleBetweenLines';
import { PublicToolProps, ToolProps, EventTypes } from '../types';

/**
 * The StackRotateTool is a tool that allows the user to rotate
 * the image on stack viewport by pressing the mouse click and dragging
 */
class StackRotateTool extends BaseTool {
  static toolName;
  touchDragCallback: (evt: EventTypes.MouseDragEventType) => void;
  mouseDragCallback: (evt: EventTypes.MouseDragEventType) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);

    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  _dragCallback(evt: EventTypes.MouseDragEventType) {
    const { element, currentPoints, startPoints } = evt.detail;
    const currentPointWorld = currentPoints.world;
    const startPointWorld = startPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const camera = viewport.getCamera();
    const width = element.clientWidth;
    const height = element.clientHeight;

    const centerCanvas: Types.Point2 = [width * 0.5, height * 0.5];
    const centerWorld = viewport.canvasToWorld(centerCanvas);

    let angle = angleBetweenLines(
      [startPointWorld, centerWorld],
      [centerWorld, currentPointWorld]
    );

    const { viewPlaneNormal } = camera;

    const v1 = vec3.sub(vec3.create(), centerWorld, startPointWorld);
    const v2 = vec3.sub(vec3.create(), centerWorld, currentPointWorld);
    const cross = vec3.cross(vec3.create(), v1, v2);
    if (vec3.dot(viewPlaneNormal, cross) > 0) {
      angle = -angle;
    }

    if (Number.isNaN(angle)) return;

    const { rotation } = (viewport as Types.IStackViewport).getProperties();
    viewport.setProperties({ rotation: rotation + angle });

    viewport.render();
  }
}

StackRotateTool.toolName = 'StackRotate';
export default StackRotateTool;
