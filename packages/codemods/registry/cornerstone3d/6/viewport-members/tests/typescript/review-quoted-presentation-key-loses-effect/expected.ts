import { Enums, RenderingEngine } from '@cornerstonejs/core';
import type { ECGViewport, PlanarViewport } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function show(mode: Enums.VOILUTFunctionType, value: string) {
  const planar = engine.getViewport<PlanarViewport>('CT');
  const ecg = engine.getViewport<ECGViewport>('ECG');

  planar.setDisplaySetPresentation({ 'voiLUTFunction': mode });
  ecg.setViewState({ "traceLayout": value });
}
