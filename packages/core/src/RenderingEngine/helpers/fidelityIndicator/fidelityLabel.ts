import type { FidelityLineState } from './fidelityIndicatorState';

export type FidelityLabelText = 'Low Fidelity' | 'Transient Low Fidelity';

/**
 * Permanent on-viewport fidelity label (FIDELITY-UI-2).
 * Null when the view is full fidelity or has no data (`done` / `hidden`).
 * `lossy` is a standing reduction, also when a load or an interaction runs
 * over another part of the view.
 */
export function fidelityLabelOf(
  state: FidelityLineState | 'hidden'
): FidelityLabelText | null {
  if (state === 'hidden' || state === 'done') {
    return null;
  }

  return state === 'lossy' ? 'Low Fidelity' : 'Transient Low Fidelity';
}
