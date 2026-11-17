import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { EPSILON } from '@kitware/vtk.js/Common/Core/Math/Constants';
import type { VOIRange } from '../types/voi';

/**
 * Creates a grayscale color transfer function that maps the VOI range linearly
 * from black (at `lower`) to white (at `upper`).
 *
 * @param voiRange - The VOI range; when `lower` or `upper` is undefined the
 * default range 0 to 1024 is used.
 * @returns A vtkColorTransferFunction with two RGB nodes. A zero width range
 * is widened by a relative epsilon so the function stays rescalable.
 */
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
