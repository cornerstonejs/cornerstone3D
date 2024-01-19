import { BaseTool } from './base';
import { getEnabledElement, VolumeViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getPointInLineOfSightWithCriteria } from '../utilities/planar';
import jumpToWorld from '../utilities/viewport/jumpToWorld';
import { PublicToolProps, ToolProps } from '../types';
import { getToolGroupForViewport } from '../store/ToolGroupManager';

/**
 * On a Maximum Intensity Projection (MIP) viewport, MIPJumpToClickTool allows the
 * user to click on a point in the MIP and the targetViewportIdS (provided in the
 * tool configuration) will be scrolled (jumped) to the location of the point with
 * the highest intensity value in the MIP.
 */
class MIPJumpToClickTool extends BaseTool {
  static toolName;

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
    const targetId = this.getTargetId(viewport as Types.IVolumeViewport);

    if (!targetId.startsWith('volumeId')) {
      throw new Error(
        `MIPJumpToClickTool: targetId is not a volumeId, you should only use MIPJumpToClickTool with a volumeId as the targetId`
      );
    }

    const volumeId = targetId.split(/volumeId:|\?/)[1];

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
      volumeId,
      maxFn
    );

    if (!brightestPoint || !brightestPoint.length) {
      return;
    }

    const { targetViewportIds, toolGroupId } = this.configuration;
    // TODO - consider making this a utility
    const viewports = renderingEngine.getViewports().filter((vp) => {
      if (targetViewportIds?.indexOf(vp.id) >= 0) {
        return true;
      }
      const foundToolGroup = getToolGroupForViewport(vp.id, renderingEngine.id);
      if (toolGroupId && toolGroupId === foundToolGroup?.id) {
        return true;
      }
      return false;
    });

    // 6. Update all the targetedViewports to jump
    viewports.forEach((viewport) => {
      // Todo: current limitation is that we cannot jump in viewports
      // that don't belong to the renderingEngine of the source clicked viewport
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

MIPJumpToClickTool.toolName = 'MIPJumpToClickTool';
export default MIPJumpToClickTool;
