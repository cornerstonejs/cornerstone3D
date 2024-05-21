import {
  getEnabledElementByIds,
  Types,
  utilities as csUtils,
} from '@cornerstonejs/core';
import Representations from '../../enums/SegmentationRepresentations';
import { config as segmentationConfig } from '../../stateManagement/segmentation';
import { setSegmentationVisibility } from '../../stateManagement/segmentation/config/segmentationVisibility';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/segmentationState';
import { getToolGroup } from '../../store/ToolGroupManager';
import { PublicToolProps, ToolProps } from '../../types';
import { BaseTool } from '../base';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../types/SegmentationStateTypes';
import { surfaceDisplay } from './Surface';
import { contourDisplay } from './Contour';
import { labelmapDisplay } from './Labelmap';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { addTool, state } from '../../store';
import PlanarFreehandContourSegmentationTool from '../annotation/PlanarFreehandContourSegmentationTool';

const planarContourToolName = PlanarFreehandContourSegmentationTool.toolName;
/**
 * In Cornerstone3DTools, displaying of segmentations are handled by the SegmentationDisplayTool.
 * Generally, any Segmentation can be viewed in various representations such as
 * labelmap (3d), contours, surface etc. As of now, Cornerstone3DTools only implements
 * Labelmap representation.
 *
 * SegmentationDisplayTool works at ToolGroup level, and is responsible for displaying the
 * segmentation representation for ALL viewports of a toolGroup, this way we can support complex
 * scenarios for displaying segmentations.
 *
 * Current Limitations:
 * - Only supports rendering of the volumetric segmentations in 3D space. (StackViewport segmentations are not supported yet)
 * - Labelmap representation is the only supported representation for now.
 *
 * Similar to other tools in Cornerstone3DTools, the SegmentationDisplayTool should
 * be added to the CornerstoneTools by calling cornerstoneTools.addTool(SegmentationDisplayTool)
 * and a toolGroup should be created for it using the ToolGroupManager API, finally
 * viewports information such as viewportId and renderingEngineId should be provided
 * to the toolGroup and the SegmentationDisplayTool should be set to be activated.
 *
 *
 */
class SegmentationDisplayTool extends BaseTool {
  static toolName;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {},
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  onSetToolEnabled(): void {
    const toolGroupId = this.toolGroupId;
    const toolGroupSegmentationRepresentations =
      getSegmentationRepresentations(toolGroupId);

    if (
      !toolGroupSegmentationRepresentations ||
      toolGroupSegmentationRepresentations.length === 0
    ) {
      return;
    }

    // for each segmentationData, make the visibility true
    toolGroupSegmentationRepresentations.forEach(
      (segmentationRepresentation) => {
        setSegmentationVisibility(
          toolGroupId,
          segmentationRepresentation.segmentationRepresentationUID,
          true
        );
      }
    );
  }

  onSetToolDisabled(): void {
    const toolGroupId = this.toolGroupId;
    const toolGroupSegmentationRepresentations =
      getSegmentationRepresentations(toolGroupId);

    if (
      !toolGroupSegmentationRepresentations ||
      toolGroupSegmentationRepresentations.length === 0
    ) {
      return;
    }

    // for each segmentationData, make the visibility false
    toolGroupSegmentationRepresentations.forEach(
      (segmentationRepresentation) => {
        setSegmentationVisibility(
          toolGroupId,
          segmentationRepresentation.segmentationRepresentationUID,
          false
        );
      }
    );
  }

  /**
   * It is used to trigger the render for each segmentations in the toolGroup.
   * Based on the segmentation representation type, it will call the corresponding
   * render function.
   *
   * @param toolGroupId - the toolGroupId
   */
  renderSegmentation = (toolGroupId: string): void => {
    const toolGroup = getToolGroup(toolGroupId);

    if (!toolGroup) {
      return;
    }

    const toolGroupSegmentationRepresentations =
      getSegmentationRepresentations(toolGroupId);

    if (
      !toolGroupSegmentationRepresentations ||
      toolGroupSegmentationRepresentations.length === 0
    ) {
      return;
    }

    // toolGroup Viewports
    const toolGroupViewports = toolGroup.viewportsInfo.map(
      ({ renderingEngineId, viewportId }) => {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );

        if (enabledElement) {
          return enabledElement.viewport;
        }
      }
    );

    // Render each segmentationData, in each viewport in the toolGroup
    const segmentationRenderList = toolGroupSegmentationRepresentations.map(
      (representation: ToolGroupSpecificRepresentation) => {
        const config = this._getMergedRepresentationsConfig(toolGroupId);

        const viewportsRenderList = [];

        const renderers = {
          [Representations.Labelmap]: labelmapDisplay,
          [Representations.Contour]: contourDisplay,
          [Representations.Surface]: surfaceDisplay,
        };

        if (representation.type === SegmentationRepresentations.Contour) {
          // if the representation is contour we need to make sure
          // that the planarFreeHandTool is added to the toolGroup
          this.addPlanarFreeHandToolIfAbsent(toolGroupId);
        }

        const display = renderers[representation.type];

        for (const viewport of toolGroupViewports) {
          const renderedViewport = display.render(
            viewport as Types.IVolumeViewport,
            representation,
            config
          );

          viewportsRenderList.push(renderedViewport);
        }
        return viewportsRenderList;
      }
    );

    Promise.allSettled(segmentationRenderList).then(() => {
      // for all viewports in the toolGroup trigger a re-render
      toolGroupViewports.forEach((viewport) => {
        viewport.render();
      });
    });
  };

  addPlanarFreeHandToolIfAbsent(toolGroupId) {
    // if it is contour we should check if the toolGroup and more importantly
    // the cornerstoneTools have the planarFreeHandTool added
    if (!(planarContourToolName in state.tools)) {
      addTool(PlanarFreehandContourSegmentationTool);
    }

    const toolGroup = getToolGroup(toolGroupId);

    // check if toolGroup has this tool
    if (!toolGroup.hasTool(planarContourToolName)) {
      toolGroup.addTool(planarContourToolName);
      toolGroup.setToolPassive(planarContourToolName);
    }
  }

  /**
   * Merge the toolGroup specific configuration with the default global configuration
   * @param toolGroupId
   * @returns
   */
  _getMergedRepresentationsConfig(
    toolGroupId: string
  ): SegmentationRepresentationConfig {
    const toolGroupConfig =
      segmentationConfig.getToolGroupSpecificConfig(toolGroupId);
    const globalConfig = segmentationConfig.getGlobalConfig();

    // merge two configurations and override the global config
    const mergedConfig = csUtils.deepMerge(globalConfig, toolGroupConfig);

    return mergedConfig;
  }
}

SegmentationDisplayTool.toolName = 'SegmentationDisplay';
export default SegmentationDisplayTool;
