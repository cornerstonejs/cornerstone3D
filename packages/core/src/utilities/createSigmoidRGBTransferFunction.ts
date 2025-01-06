import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import type { VOIRange } from '../types/voi';
import * as windowLevelUtil from './windowLevel';
import { logit } from './logit';

/**
 * A utility that can be used to generate an Sigmoid RgbTransferFunction.
 * Sigmoid transfer functions are used in the dicom specification:
 * https://dicom.nema.org/medical/dicom/2018b/output/chtml/part03/sect_C.11.2.html
 *
 * @example
 * Setting an RGB Transfer function from the viewport:
 * ```
 * const sigmoidRGBTransferFunction = createSigmoidRGBTransferFunction(0, 255, { lower: 0, upper: 255} );
 * viewport
 *   .getActor()
 *   .getProperty()
 *   .setRGBTransferFunction(0, sigmoidRGBTransferFunction);
 * ```
 *
 * @see {@link https://kitware.github.io/vtk-js/api/Rendering_Core_ColorTransferFunction.html|VTK.js: ColorTransferFunction}
 * @param voiRange
 * @param approximationNodes
 */
export default function createSigmoidRGBTransferFunction(
  voiRange: VOIRange,
  approximationNodes: number = 1024 // humans can perceive no more than 900 shades of gray doi: 10.1007/s10278-006-1052-3
): vtkColorTransferFunction {
  const { windowWidth, windowCenter } = windowLevelUtil.toWindowLevel(
    voiRange.lower,
    voiRange.upper
  );

  // we slice out the first and last value to avoid 0 and 1 Infinity values
  const range: number[] = Array.from(
    { length: approximationNodes },
    (_, i) => (i + 1) / (approximationNodes + 2)
  );

  const table: number[] = range.flatMap((y) => {
    const x = logit(y, windowCenter, windowWidth);
    return [x, y, y, y, 0.5, 0.0];
  });

  const cfun = vtkColorTransferFunction.newInstance();
  cfun.buildFunctionFromArray(
    vtkDataArray.newInstance({
      values: table,
      numberOfComponents: 6,
    }) // Type assertion might be necessary if vtkDataArray types are not fully compatible
  );
  return cfun;
}
