import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { VOIRange } from '../types/voi';
import { ensureNonZeroVOIRange } from './voiRangeGuards';

export default function createLinearRGBTransferFunction(
  voiRange: VOIRange
): vtkColorTransferFunction {
  const cfun = vtkColorTransferFunction.newInstance();
  let lower = 0;
  let upper = 1024;
  if (voiRange.lower !== undefined && voiRange.upper !== undefined) {
    // vtk keeps one point only when both are at the same x.
    ({ lower, upper } = ensureNonZeroVOIRange(voiRange));
  }

  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
  cfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

  return cfun;
}
