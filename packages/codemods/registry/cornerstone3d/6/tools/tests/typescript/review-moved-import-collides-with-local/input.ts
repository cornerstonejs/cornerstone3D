import { createLegacyVolumeLabelmapPlan } from '@cornerstonejs/tools/tools/displayTools/Labelmap/labelmapRenderPlan/legacyVolumePlan';

export function createVolumeLabelmapPlan() {
  return createLegacyVolumeLabelmapPlan;
}

export const plans = { createLegacyVolumeLabelmapPlan };
