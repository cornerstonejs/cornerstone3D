import { utilities, segmentation } from '@cornerstonejs/tools';
import { createVolumeLabelmapPlan } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/volumeLabelmapPlan';
import { getViewSlabDepthOfViewport } from '@cornerstonejs/tools/utilities/genericViewportToolHelpers';

const spatial = { rotateViewportAroundWorldPoint: () => false };

console.log(
  utilities.calibrateImageSpacing,
  segmentation,
  createVolumeLabelmapPlan,
  getViewSlabDepthOfViewport,
  spatial.rotateViewportAroundWorldPoint()
);
