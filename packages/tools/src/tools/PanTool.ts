import { BaseTool } from './base';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import type { EventTypes, PublicToolProps, ToolProps } from '../types';

/**
 * Tool that pans the camera in the plane defined by the viewPlaneNormal and the viewUp.
 */
class PanTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
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
  _transformNormal(normal, mat) {
    return [
      mat[0] * normal[0] + mat[3] * normal[1] + mat[6] * normal[2],
      mat[1] * normal[0] + mat[4] * normal[1] + mat[7] * normal[2],
      mat[2] * normal[0] + mat[5] * normal[1] + mat[8] * normal[2],
    ];
  }

  _updateClippingPlanes(viewport) {
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor;
    const mapper = actor.getMapper();
    const matrix = actor.getMatrix();

    // Extract rotation part for normals
    const rot = [
      matrix[0],
      matrix[1],
      matrix[2],
      matrix[4],
      matrix[5],
      matrix[6],
      matrix[8],
      matrix[9],
      matrix[10],
    ];

    // Get original planes from the viewport (VolumeViewport3D)
    const originalPlanes = viewport.getOriginalClippingPlanes?.();
    if (!originalPlanes || !originalPlanes.length) {
      return;
    }

    mapper.removeAllClippingPlanes();
    originalPlanes.forEach(({ origin, normal }) => {
      // Transform origin (full 4x4)
      const o = [
        matrix[0] * origin[0] +
          matrix[4] * origin[1] +
          matrix[8] * origin[2] +
          matrix[12],
        matrix[1] * origin[0] +
          matrix[5] * origin[1] +
          matrix[9] * origin[2] +
          matrix[13],
        matrix[2] * origin[0] +
          matrix[6] * origin[1] +
          matrix[10] * origin[2] +
          matrix[14],
      ];
      // Transform normal (rotation only)
      const n = this._transformNormal(normal, rot);
      const plane = vtkPlane.newInstance({ origin: o, normal: n });
      mapper.addClippingPlane(plane);
    });
  }

  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    const deltaPointsWorld = deltaPoints.world;
    // This occurs when the mouse event is fired but the mouse hasn't moved a full pixel yet (high resolution mice)
    if (
      deltaPointsWorld[0] === 0 &&
      deltaPointsWorld[1] === 0 &&
      deltaPointsWorld[2] === 0
    ) {
      return;
    }
    const camera = enabledElement.viewport.getCamera();
    const { focalPoint, position } = camera;

    const updatedPosition = <Types.Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ];

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ];

    enabledElement.viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    // Update clipping planes after pan
    this._updateClippingPlanes(enabledElement.viewport);
    enabledElement.viewport.render();
  }
}

PanTool.toolName = 'Pan';
export default PanTool;
