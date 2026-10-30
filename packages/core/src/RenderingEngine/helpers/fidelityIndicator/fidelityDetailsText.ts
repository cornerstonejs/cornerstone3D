import type { Point3, ViewportFidelityState } from '../../../types';
import type { FidelityLine } from './fidelityIndicatorState';

/**
 * Clinician-facing hover details from the absolute fidelity record
 * (FIDELITY-DISCOVER-1..4). No GPU / texture / retrieval jargon.
 */
export function fidelityDetailsTextOf(
  state: ViewportFidelityState,
  lines?: FidelityLine[]
): string {
  if (!state.cause && !state.magnitude && !state.progressive) {
    if (state.shownState === 'done' || state.lossy === false) {
      return 'Image is at full available detail.';
    }

    return 'No image data in this viewport yet';
  }

  // A reduced texture keeps `cause` and `magnitude` at every zoom; the
  // verdict decides whether the reduction is visible.
  if (state.shownState === 'done' || state.lossy === false) {
    return 'Image is at full available detail.';
  }

  const parts: string[] = [];
  const multi =
    lines && lines.length > 1
      ? lines.map((line) => line.label).filter(Boolean)
      : [];

  if (multi.length > 1) {
    parts.push(multi.join(', '));
  }

  switch (state.cause) {
    case 'incompleteLoad':
      parts.push('Image is still loading.');
      parts.push(...progressLines(state));
      parts.push('Waiting should improve the image.');
      break;
    case 'performanceTarget':
      parts.push('Detail is reduced while you interact.');
      parts.push(...magnitudeLines(state.magnitude));
      parts.push('Full detail returns when interaction stops.');
      break;
    case 'lossyDecode':
      parts.push('Image uses reduced decode quality.');
      parts.push(...magnitudeLines(state.magnitude));
      parts.push(...waitLine(state.transient));
      break;
    case 'deviceTextureLimit':
      parts.push('Image detail is reduced to fit the limits of this device.');
      parts.push(...magnitudeLines(state.magnitude));
      parts.push('Waiting will not improve the image.');
      break;
    case 'memoryBudget':
      parts.push('Image detail is reduced to fit the available memory.');
      parts.push(...magnitudeLines(state.magnitude));
      parts.push('Waiting will not improve the image.');
      break;
    default:
      if (state.transient) {
        parts.push('Image detail is temporarily reduced.');
        parts.push(...progressLines(state));
        parts.push(...magnitudeLines(state.magnitude));
        parts.push('Waiting should improve the image.');
      } else if (state.magnitude && isReducedMagnitude(state.magnitude)) {
        parts.push('Image detail is reduced.');
        parts.push(...magnitudeLines(state.magnitude));
      } else if (state.progressive) {
        parts.push(...progressLines(state));
      } else {
        parts.push('Image is at full available detail.');
      }
      break;
  }

  return parts.filter(Boolean).join('\n');
}

function progressLines(state: ViewportFidelityState): string[] {
  const fraction = state.progressive?.loadedFraction;

  if (fraction === undefined || !(fraction >= 0)) {
    return [];
  }

  const percent = Math.min(99, Math.floor(100 * fraction));

  return [`${percent}% of data arrived.`];
}

function magnitudeLines(magnitude?: Point3): string[] {
  if (!magnitude || !isReducedMagnitude(magnitude)) {
    return [];
  }

  return [
    `Reduction: i/${formatAxis(magnitude[0])}, j/${formatAxis(magnitude[1])}, k/${formatAxis(magnitude[2])}`,
  ];
}

function waitLine(transient?: boolean): string[] {
  if (transient) {
    return ['Waiting should improve the image.'];
  }

  return [];
}

function isReducedMagnitude(magnitude: Point3): boolean {
  return magnitude.some((value) => value > 1 + 1e-6);
}

function formatAxis(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '1';
  }

  const rounded = Math.round(value * 100) / 100;

  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
