import type { SvgFidelityState } from './fidelityIndicatorState';

export type FidelityLabelText = 'Low Fidelity' | 'Transient Low Fidelity';

/**
 * Permanent on-viewport label beside the fidelity icon (FIDELITY-UI-2).
 * Null when the view is full fidelity or has no data (`done` / `hidden`).
 * `lossy` is a standing reduction, also when a load or an interaction runs
 * over another part of the view.
 */
export function fidelityLabelOf(
  svgState: SvgFidelityState | 'hidden'
): FidelityLabelText | null {
  if (svgState === 'hidden' || svgState === 'done') {
    return null;
  }

  return svgState === 'lossy' ? 'Low Fidelity' : 'Transient Low Fidelity';
}
