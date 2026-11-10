import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { EPSILON } from '@kitware/vtk.js/Common/Core/Math/Constants';
import type { VOIRange } from '../types/voi';

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

  // A zero width window (for example WC 0.5 / WW 1, which the linear VOI
  // formula maps to lower === upper) would put both nodes at the same scalar,
  // and vtk keeps only the second one. The function range is then zero wide,
  // so a later setRange computes NaN/Infinity node positions and the LUT stays
  // a step function until it is recreated. Move the nodes a relative epsilon
  // apart instead: the image still renders as a threshold at that value.
  if (upper === lower) {
    const halfWidth = Math.max(Math.abs(lower), 1) * EPSILON;

    lower -= halfWidth;
    upper += halfWidth;
  }
  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
  cfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

  return cfun;
}
