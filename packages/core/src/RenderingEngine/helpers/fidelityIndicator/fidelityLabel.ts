import type { ViewportFidelityState } from '../../../types';
import type { SvgFidelityState } from './fidelityIndicatorState';

export type FidelityLabelText = 'Low Fidelity' | 'Transient Low Fidelity';

/**
 * Permanent on-viewport label beside the fidelity icon (FIDELITY-NOTIFY-1).
 * Null when the view is full fidelity or has no data (`done` / `hidden`).
 */
export function fidelityLabelOf(
  svgState: SvgFidelityState | 'hidden',
  absoluteState?: ViewportFidelityState
): FidelityLabelText | null {
  if (svgState === 'hidden' || svgState === 'done') {
    return null;
  }

  if (
    svgState === 'loading' ||
    svgState === 'lod' ||
    absoluteState?.transient === true
  ) {
    return 'Transient Low Fidelity';
  }

  // Standing reduction / decimation (`lossy`).
  return 'Low Fidelity';
}
