import * as vtkColorTransferFunctionModule from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction.js';
import { VOIRange } from '../types/index.js';

type vtkColorTransferFunctionInstance = ReturnType<
  typeof vtkColorTransferFunctionModule.vtkColorTransferFunction.newInstance
>;

export default function createLinearRGBTransferFunction(
  voiRange: VOIRange
): vtkColorTransferFunctionInstance {
  const cfun = vtkColorTransferFunctionModule.newInstance();
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
