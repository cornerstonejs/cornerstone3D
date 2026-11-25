import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type { VOIRange } from '../types/voi';
import { getVOIRangeEpsilon } from './voiRangeGuards';

export default function createLinearRGBTransferFunction(
  voiRange: VOIRange
): vtkColorTransferFunction {
  const cfun = vtkColorTransferFunction.newInstance();
  let lower = 0;
  let upper = 1024;
  if (voiRange.lower !== undefined && voiRange.upper !== undefined) {
    lower = voiRange.lower;
    upper = voiRange.upper;
  }

  // A zero-width range (e.g. an image with no signal, min === max) would put
  // both points at the same x; vtk drops the first (black) one, leaving a
  // single white point that renders the whole image white.
  if (upper <= lower) {
    upper = lower + getVOIRangeEpsilon(lower);
  }
  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
  cfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

  return cfun;
}
