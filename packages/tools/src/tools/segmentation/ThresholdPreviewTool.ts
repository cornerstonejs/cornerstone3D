import { cache } from '@cornerstonejs/core';

import {
  activeSegmentation,
  segmentIndex as segmentIndexController,
  config as segmentationConfig,
  state as segmentationState,
} from '../../stateManagement/segmentation';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { PublicToolProps, ToolProps } from '../../types';
import { BaseTool } from '../base';
import { fillInsideCube } from './strategies/fillCube';
import { getToolGroup } from '../../store/ToolGroupManager';
import { LabelmapSegmentationData } from '../../types/LabelmapTypes';
import { easeInOutBell } from '../../utilities/animationHelpers';

class ThresholdPreviewTool extends BaseTool {
  static toolName;

  editData: {
    annotation: any;
    segmentationId: string;
    segmentation: any;
    imageVolume: any;
    segmentIndex: number;
    segmentsLocked: number[];
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  highlightIntervalId: any;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        strategies: {
          FILL_INSIDE_CUBE: fillInsideCube,
        },
        strategySpecificConfiguration: {
          THRESHOLD_INSIDE_CUBE: {
            threshold: [-150, -70], // E.g. CT Fat // Only used during threshold strategies.
          },
        },
        defaultStrategy: 'FILL_INSIDE_CUBE',
        activeStrategy: 'FILL_INSIDE_CUBE',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  public getConfiguration = (): any => {
    const config = segmentationConfig.getGlobalConfig();
    const { renderInactiveSegmentations } = config;

    const labelmapRepresentationConfig = config.representations.LABELMAP;

    const {
      renderOutline,
      outlineWidthActive,
      renderFill,
      fillAlpha,
      fillAlphaInactive,
      outlineOpacity,
      outlineOpacityInactive,
    } = labelmapRepresentationConfig;

    return {
      fillAlpha,
      fillAlphaInactive,
      outlineWidthActive,
      renderFill,
      renderInactiveSegmentations,
      renderOutline,
      outlineOpacity,
      outlineOpacityInactive,
    };
  };

  setConfiguration = (newConfiguration: Record<string, any>): void => {
    this.configuration.strategySpecificConfiguration.THRESHOLD_INSIDE_CUBE = {
      threshold: newConfiguration,
    };

    this.onSetToolEnabled(null);
  };

  onSetToolEnabled(event): void {
    const toolGroupId = this.toolGroupId;

    const toolGroup = getToolGroup(toolGroupId);

    if (!toolGroup) {
      return;
    }

    // toolGroup Viewports
    const toolGroupViewports = toolGroup.getViewports();

    const viewport = toolGroupViewports[0];

    const actors = viewport.getActors();

    const firstVolumeActorUID = actors[0].uid;
    const imageVolume = cache.getVolume(firstVolumeActorUID);

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);

    const { segmentationId, type } = activeSegmentationRepresentation;

    const { representationData } = getSegmentation(segmentationId);

    const { volumeId } = representationData[type] as LabelmapSegmentationData;

    const segmentation = cache.getVolume(volumeId);

    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);

    const operationData = {
      points: [],
      imageVolume,
      volume: segmentation,
      segmentationId,
      segmentIndex,
      segmentsLocked: [],
      strategySpecificConfiguration:
        this.configuration.strategySpecificConfiguration,
    };

    this.applyActiveStrategy(null, operationData);

    function _getSegmentationRepresentation(segmentationId, toolGroupId) {
      const segmentationRepresentations =
        segmentationState.getSegmentationRepresentations(toolGroupId);

      if (segmentationRepresentations.length === 0) {
        return;
      }

      // Todo: this finds the first segmentation representation that matches the segmentationId
      // If there are two labelmap representations from the same segmentation, this will not work
      const representation = segmentationRepresentations.find(
        (representation) => representation.segmentationId === segmentationId
      );

      return representation;
    }

    const segmentationRepresentation = _getSegmentationRepresentation(
      segmentationId,
      this.toolGroupId
    );

    const animationLength = 750;

    // Animation for the segmentIndex

    const { fillAlpha } = this.getConfiguration();

    let count = 0;
    const intervalTime = 16;
    const numberOfFrames = Math.ceil(animationLength / intervalTime);

    clearInterval(this.highlightIntervalId);

    this.highlightIntervalId = setInterval(() => {
      const x = (count * intervalTime) / animationLength;
      const easeOutFillAlpha = easeInOutBell(x, fillAlpha);

      if (easeOutFillAlpha < 0) {
        count = 0;
      } else {
        count++;
      }
      segmentationConfig.setSegmentSpecificConfig(
        this.toolGroupId,
        segmentationRepresentation.segmentationRepresentationUID,
        {
          [segmentIndex]: {
            LABELMAP: {
              fillAlpha: easeOutFillAlpha,
            },
          },
        }
      );

      if (count === numberOfFrames) {
        segmentationConfig.setSegmentSpecificConfig(
          this.toolGroupId,
          segmentationRepresentation.segmentationRepresentationUID,
          {}
        );
      }
    }, intervalTime);
  }
}

ThresholdPreviewTool.toolName = 'LabelmapThresholdPreview';
export default ThresholdPreviewTool;
