import { createVolumeLabelmapPlan } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/volumeLabelmapPlan';
import {
  syncLegacyLabelmapData,
  getReferencedImageIdToCurrentImageIdMap as imageIdMap,
} from '@cornerstonejs/tools/segmentation/labelmapModel/labelmapPrimaryLayerFields';

const plan = createVolumeLabelmapPlan(viewport, representation);

syncLegacyLabelmapData(labelmap);

console.log(plan, imageIdMap(labelmap));
