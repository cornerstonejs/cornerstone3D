import type { DataAddOptions } from '../ViewportArchitectureTypes';

export { imageQualityStatusOf } from '../../helpers/fidelityIndicator/collectFidelityLines';

/**
 * Whether a planar binding is a segmentation overlay, which the fidelity
 * ignores (FIDELITY-STATE-9). Render paths set `excludeFromFidelity` from it.
 */
export function isSegmentationOverlayData(
  payload: { reference?: { kind?: string } },
  options: DataAddOptions | undefined
): boolean {
  return (
    options?.role === 'overlay' && payload.reference?.kind === 'segmentation'
  );
}
