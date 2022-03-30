import { BaseTool } from './base';
import { getEnabledElement, VolumeViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getPointInLineOfSightWithCriteria } from '../utilities/planar';
import jumpToWorld from '../utilities/viewport/jumpToWorld';
import { PublicToolProps, ToolProps } from '../types';

/**
 * On a Maximum Intensity Projection (MIP) viewport, MIPJumpToClickTool allows the
 * user to click on a point in the MIP and the targetViewportIdS (provided in the
 * tool configuration) will be scrolled (jumped) to the location of the point with
 * the highest intensity value in the MIP.
 */
export default class MIPJumpToClickTool extends BaseTool {
  static toolName = 'MIPJumpToClickTool';

  _bounds: any;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        targetViewportIds: [],
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Handles the click event, and move the camera's focal point the brightest
   * point that is in the line of sight of camera. This function 1) search for the
   * brightest point in the line of sight, 2) move the camera to that point,
   * this triggers a cameraModified event which then 4) moves all other synced
   * viewports and their crosshairs.
   *
   * @param evt - click event
   */
  mouseClickCallback(evt): void {
    const { element, currentPoints } = evt.detail;

    // 1. Getting the enabled element
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    // 2. Getting the target volume that is clicked on
    const targetVolumeId = this.getTargetId(viewport as Types.IVolumeViewport);

    // 3. Criteria function to search for the point (maximum intensity)
    let maxIntensity = -Infinity;
    const maxFn = (intensity, point) => {
      if (intensity > maxIntensity) {
        maxIntensity = intensity;
        return point;
      }
    };

    // 4. Search for the brightest point location in the line of sight
    const brightestPoint = getPointInLineOfSightWithCriteria(
      viewport as Types.IVolumeViewport,
      currentPoints.world,
      targetVolumeId,
      maxFn
    );

    if (!brightestPoint || !brightestPoint.length) {
      return;
    }

    const { targetViewportIds } = this.configuration;

    // 6. Update all the targetedViewports to jump
    targetViewportIds.forEach((viewportId) => {
      // Todo: current limitation is that we cannot jump in viewports
      // that don't belong to the renderingEngine of the source clicked viewport
      const viewport = renderingEngine.getViewport(viewportId);

      if (viewport instanceof VolumeViewport) {
        jumpToWorld(viewport, brightestPoint);
      } else {
        console.warn(
          'Cannot jump to specified world coordinates for a viewport that is not a VolumeViewport'
        );
      }
    });
  }
}
