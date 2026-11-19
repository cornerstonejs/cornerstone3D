import { createLegacyVolumeLabelmapPlan } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/legacyVolumePlan';
import {
  syncLegacyLabelmapData,
  getReferencedImageIdToCurrentImageIdMap as imageIdMap,
} from '@cornerstonejs/tools/segmentation/labelmapModel/labelmapLegacyAdapter';

const plan = createLegacyVolumeLabelmapPlan(viewport, representation);

syncLegacyLabelmapData(labelmap);

console.log(plan, imageIdMap(labelmap));
