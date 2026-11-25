import { getEnabledElement } from '@cornerstonejs/core';
import type { LabelmapSegmentationData } from '../../../types/LabelmapTypes';
import type { LabelmapRenderingConfig } from '../../../types/SegmentationStateTypes';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import {
  resolveLabelmapRenderPlan,
  type LabelmapRenderPlanMountResult,
} from './labelmapRenderPlan';

/**
 * It adds a labelmap segmentation representation of the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that will be rendered.
 * @param labelMapData - The labelmap segmentation data.
 * @param segmentationId - The segmentation id of the labelmap.
 *
 * @internal
 */
async function addLabelmapToElement(
  element: HTMLDivElement,
  labelMapData: LabelmapSegmentationData,
  segmentationId: string,
  config: LabelmapRenderingConfig
): Promise<LabelmapRenderPlanMountResult> {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  const renderPlan = resolveLabelmapRenderPlan({
    viewport,
    segmentation,
    representation: {
      segmentationId,
      config,
    },
  });

  return renderPlan.mount({ labelMapData });
}

export default addLabelmapToElement;
