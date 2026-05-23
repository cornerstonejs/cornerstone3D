import { OrientationAxis } from '../../../enums';
import type { PlanarViewState, PlanarOrientation } from './PlanarViewportTypes';
import { clonePlanarOrientation } from './planarLegacyCompatibility';

export {
  DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD,
  DEFAULT_PLANAR_CPU_VOLUME_THRESHOLD,
  PlanarRenderPathDecisionService,
  defaultPlanarRenderPathDecisionService,
  getPlanarAcquisitionOrientation,
  selectPlanarRenderPath,
  shouldUseCPU,
} from './PlanarRenderPathDecisionService';
export type {
  PlanarRenderPathDecisionOptions,
  SelectedPlanarRenderPath,
} from './PlanarRenderPathDecisionService';

export function normalizePlanarOrientation(
  orientation: PlanarOrientation | undefined,
  acquisitionOrientation?: PlanarViewState['orientation']
): PlanarViewState['orientation'] {
  if (!orientation || orientation === OrientationAxis.ACQUISITION) {
    return OrientationAxis.ACQUISITION;
  }

  if (acquisitionOrientation && orientation === acquisitionOrientation) {
    return OrientationAxis.ACQUISITION;
  }

  return clonePlanarOrientation(orientation);
}
