import { createVolumeLabelmapPlan as createLegacyVolumeLabelmapPlan } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/volumeLabelmapPlan';

export function createVolumeLabelmapPlan() {
  return createLegacyVolumeLabelmapPlan;
}

export const plans = { createLegacyVolumeLabelmapPlan };
