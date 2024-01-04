import {
  cache,
  getEnabledElement,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import {
  PublicToolProps,
  ToolProps,
  EventTypes,
  Segmentation,
} from '../../types';
import { triggerSegmentationModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from './strategies/utils/stackVolumeCheck';
import {
  getActiveSegmentation,
  getActiveSegmentationRepresentation,
} from '../../stateManagement/segmentation/activeSegmentation';
import RepresentationTypes from '../../enums/SegmentationRepresentations';
import { setActiveSegmentIndex } from '../../stateManagement/segmentation/segmentIndex';

/**
 * Represents a tool used for segment selection. It is used to select a segment
 * by hovering over it.
 *
 */
class SegmentSelectTool extends BaseTool {
  static toolName;
  private hoverTimer: ReturnType<typeof setTimeout> | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);
    this.hoverTimer = null;
  }

  mouseMoveCallback = (evt: EventTypes.InteractionEventType): boolean => {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }

    this.hoverTimer = setTimeout(() => {
      this._setActiveSegment(evt);
      this.hoverTimer = null;
    }, 500);

    return true;
  };

  onSetToolEnabled = (): void => {
    this.onSetToolActive();
  };

  onSetToolActive = (): void => {
    this.hoverTimer = null;
  };

  onSetToolDisabled = (): void => {
    this.hoverTimer = null;
  };

  _setActiveSegment(evt = {} as EventTypes.InteractionEventType): void {
    const { element, currentPoints } = evt.detail;

    const worldPoint = currentPoints.world;

    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;

    const activeSegmentation = getActiveSegmentation(this.toolGroupId);

    if (activeSegmentation.type === RepresentationTypes.Labelmap) {
      this._setActiveSegmentLabelmap(activeSegmentation, worldPoint, viewport);
    } else {
      throw Error('non-labelmap segmentation not supported yet');
    }
  }

  _setActiveSegmentLabelmap(
    activeSegmentation: Segmentation,
    worldPoint: Types.Point3,
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): void {
    const imageDataInfo = viewport.getImageData();

    if (!imageDataInfo) {
      return;
    }

    const labelmapData = activeSegmentation.representationData.LABELMAP;

    let hoveredSegmentIndex;

    if (isVolumeSegmentation(activeSegmentation.representationData.LABELMAP)) {
      const { volumeId } = labelmapData as LabelmapSegmentationDataVolume;

      const segmentationVolume = cache.getVolume(volumeId);

      if (!segmentationVolume) {
        return;
      }

      hoveredSegmentIndex =
        segmentationVolume.imageData.getScalarValueFromWorld(worldPoint);
    } else {
      const { imageIdReferenceMap } =
        labelmapData as LabelmapSegmentationDataStack;

      const currentImageId = viewport.getCurrentImageId();
      const segmentationImageId = imageIdReferenceMap.get(currentImageId);

      const image = cache.getImage(segmentationImageId);

      if (!image) {
        return;
      }

      const activeSegmentationRepresentation =
        getActiveSegmentationRepresentation(this.toolGroupId);

      if (!activeSegmentationRepresentation) {
        return;
      }

      const segmentationActor = viewport.getActor(
        activeSegmentationRepresentation.segmentationRepresentationUID
      );

      const imageData = segmentationActor?.actor.getMapper().getInputData();

      const indexIJK = csUtils.transformWorldToIndex(imageData, worldPoint);

      // since it is a stack we don't need to check the z
      const flattenedIndex = indexIJK[0] + indexIJK[1] * image.columns;

      const scalars = imageData.getPointData().getScalars().getData();

      hoveredSegmentIndex = scalars[flattenedIndex];
    }

    // No need to select background
    if (!hoveredSegmentIndex || hoveredSegmentIndex === 0) {
      return;
    }

    setActiveSegmentIndex(
      activeSegmentation.segmentationId,
      hoveredSegmentIndex
    );

    const renderingEngine = viewport.getRenderingEngine();

    // update states
    triggerSegmentationModified(activeSegmentation.segmentationId);
    triggerAnnotationRenderForViewportIds(
      renderingEngine,
      renderingEngine.getViewports().map((v) => v.id)
    );
  }
}

SegmentSelectTool.toolName = 'SegmentSelectTool';
export default SegmentSelectTool;
