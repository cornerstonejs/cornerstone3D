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

  // A window width of 1 collapses lower onto upper under the DICOM LINEAR
  // formula (C.11.2.1.2.1 subtracts (w - 1) / 2 from both ends), which is what
  // the all zero padding frame at the start of many multi frame US cines gives.
  // Coincident nodes are unrecoverable rather than merely wrong: VTK.js
  // setMappingRange rescales existing nodes by newSpan / currentSpan, so every
  // later window change divides by zero and the nodes never move again, leaving
  // each following frame bilevel while voiRange still looks correct.
  if (upper === lower) {
    const halfWidth = Math.max(Math.abs(lower), 1) * EPSILON;

    lower -= halfWidth;
    upper += halfWidth;
  }

  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
  cfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

  return cfun;
}
