import { BaseTool } from './base';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import {
  getViewportZoomPan,
  panViewportByCanvasDelta,
} from '../utilities/viewportFraming';

/**
 * What the pan tool reads from a viewport: the world and canvas transforms,
 * and the image data of the picture for `limitToViewport`.
 */
type PannedViewport = {
  element: HTMLDivElement;
  canvasToWorld(canvasPos: Types.Point2): Types.Point3;
  worldToCanvas(worldPos: Types.Point3): Types.Point2;
  getImageData?(): Pick<
    Types.CPUIImageData,
    'dimensions' | 'spacing' | 'origin' | 'direction'
  > & {
    imageData?: { getBounds?: () => number[] };
  };
};

/**
 * Tool that pans the camera in the plane defined by the viewPlaneNormal and the viewUp.
 */
class PanTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        limitToViewport: false,
        //put ignore in false
        ignoreX: false,
        ignoreY: false,
        ignoreZ: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    this._dragCallback(evt);
  }

  /**
   * Pans the viewport by a drag. With `ignoreX`, `ignoreY` or `ignoreZ` the
   * picture moves by the canvas delta of the world delta of the drag with
   * those axes at zero, as the legacy camera moved by that world delta. With
   * `limitToViewport` a drag that would take the picture out of the canvas,
   * or uncover the canvas when the picture is zoomed in, does not move it.
   * The limit reads the move that the picture makes, with the ignored axes at
   * zero, so a blocked axis does not stop the move on the other axis.
   */
  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    const deltaPointsWorld = deltaPoints.world;
    const deltaPointsCanvas = deltaPoints.canvas;

    // This occurs when the mouse event is fired but the mouse hasn't moved a full pixel yet (high resolution mice)
    if (
      deltaPointsWorld[0] === 0 &&
      deltaPointsWorld[1] === 0 &&
      deltaPointsWorld[2] === 0
    ) {
      return;
    }
    // Block X-axis movement if ignoreX is enabled
    if (this.configuration.ignoreX) {
      deltaPointsWorld[0] = 0;
    }
    // Block Y-axis movement if ignoreY is enabled
    if (this.configuration.ignoreY) {
      deltaPointsWorld[1] = 0;
    }

    // Block Z-axis movement if ignoreZ is enabled
    if (this.configuration.ignoreZ) {
      deltaPointsWorld[2] = 0;
    }
    const viewport = enabledElement.viewport;
    const pannedViewport = viewport as unknown as PannedViewport;
    const canvasDelta =
      this.configuration.ignoreX ||
      this.configuration.ignoreY ||
      this.configuration.ignoreZ
        ? this.getCanvasDeltaOfWorldDelta(pannedViewport, deltaPointsWorld)
        : deltaPointsCanvas;

    if (
      this.configuration.limitToViewport &&
      !this.isPictureKeptInCanvas(pannedViewport, canvasDelta)
    ) {
      return;
    }

    if (panViewportByCanvasDelta(viewport, canvasDelta)) {
      viewport.render();
    }
  }

  /**
   * The canvas delta of a world delta: how far a world point at the centre
   * of the canvas moves on the canvas when it moves by the world delta.
   */
  private getCanvasDeltaOfWorldDelta(
    viewport: PannedViewport,
    worldDelta: Types.Point3
  ): Types.Point2 {
    const { clientWidth, clientHeight } = viewport.element;
    const centre: Types.Point2 = [clientWidth / 2, clientHeight / 2];
    const centreWorld = viewport.canvasToWorld(centre);
    const movedCanvas = viewport.worldToCanvas([
      centreWorld[0] + worldDelta[0],
      centreWorld[1] + worldDelta[1],
      centreWorld[2] + worldDelta[2],
    ]);
    const centreCanvas = viewport.worldToCanvas(centreWorld);

    return [movedCanvas[0] - centreCanvas[0], movedCanvas[1] - centreCanvas[1]];
  }

  /**
   * Whether a pan by a canvas delta keeps the picture as the legacy tool
   * kept it with `limitToViewport`: at a zoom of 1 or less no edge of the
   * picture leaves the canvas in the direction of the move; zoomed in no
   * edge of the picture comes into the canvas in the direction of the move.
   * The picture is the box of the image data on the canvas. A viewport with
   * no image data is not limited.
   */
  private isPictureKeptInCanvas(
    viewport: PannedViewport,
    canvasDelta: Types.Point2
  ): boolean {
    const corners = getPictureCornersInWorld(viewport);

    if (!corners) {
      return true;
    }

    const canvasCorners = corners.map((corner) =>
      viewport.worldToCanvas(corner)
    );
    const xs = canvasCorners.map(([x]) => x);
    const ys = canvasCorners.map(([, y]) => y);
    const imageLeft = Math.min(...xs);
    const imageRight = Math.max(...xs);
    const imageTop = Math.min(...ys);
    const imageBottom = Math.max(...ys);
    const { clientWidth, clientHeight } = viewport.element;
    const zoom = getViewportZoomPan(viewport)?.zoom ?? 1;
    const [dx, dy] = canvasDelta;

    if (zoom <= 1) {
      return !(
        (imageLeft + dx < 0 && dx < 0) ||
        (imageRight + dx > clientWidth && dx > 0) ||
        (imageTop + dy < 0 && dy < 0) ||
        (imageBottom + dy > clientHeight && dy > 0)
      );
    }

    return !(
      (imageLeft + dx > 0 && dx > 0) ||
      (imageRight + dx < clientWidth && dx < 0) ||
      (imageTop + dy > 0 && dy > 0) ||
      (imageBottom + dy < clientHeight && dy < 0)
    );
  }
}

/**
 * The eight corners in world of the image data that a viewport shows: of its
 * bounds when it has them, as the legacy tool read the bounds of the image
 * of the default actor, else of its first and last voxels.
 */
function getPictureCornersInWorld(
  viewport: PannedViewport
): Types.Point3[] | undefined {
  const imageData = viewport.getImageData?.();
  const bounds = imageData?.imageData?.getBounds?.();

  if (bounds?.length === 6) {
    const corners: Types.Point3[] = [];

    for (const x of [bounds[0], bounds[1]]) {
      for (const y of [bounds[2], bounds[3]]) {
        for (const z of [bounds[4], bounds[5]]) {
          corners.push([x, y, z]);
        }
      }
    }

    return corners;
  }

  const { dimensions, spacing, origin, direction } = imageData || {};

  if (!dimensions || !spacing || !origin || !direction) {
    return;
  }

  const corners: Types.Point3[] = [];

  for (const i of [0, dimensions[0] - 1]) {
    for (const j of [0, dimensions[1] - 1]) {
      for (const k of [0, (dimensions[2] ?? 1) - 1]) {
        corners.push(
          [0, 1, 2].map(
            (axis) =>
              origin[axis] +
              i * spacing[0] * direction[axis] +
              j * spacing[1] * direction[3 + axis] +
              k * (spacing[2] ?? 1) * direction[6 + axis]
          ) as Types.Point3
        );
      }
    }
  }

  return corners;
}

PanTool.toolName = 'Pan';
export default PanTool;
