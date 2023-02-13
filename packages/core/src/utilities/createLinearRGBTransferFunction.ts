import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import { VOIRange } from '../types';

export default function createLinearRGBTransferFunction(
  voiRange: VOIRange
): vtkColorTransferFunction {
  const cfun = vtkColorTransferFunction.newInstance();
  let lower = 0;
  let upper = 1024;
  if (
    voiRange &&
    voiRange.lower !== undefined &&
    voiRange.upper !== undefined
  ) {
    lower = voiRange.lower;
    upper = voiRange.upper;
  }
  cfun.addRGBPoint(lower, 0.0, 0.0, 0.0);
  cfun.addRGBPoint(upper, 1.0, 1.0, 1.0);

  return cfun;
}
