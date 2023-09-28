import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { VOIRange } from '../types';
import { windowLevel as windowLevelUtil } from '.';

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
 * @param rgbTransferFunction
 */
export default function createSigmoidRGBTransferFunction(
  voiRange: VOIRange,
  approximationNodes = 1024 // humans can precieve no more than 900 shades of gray doi: 10.1007/s10278-006-1052-3
): vtkColorTransferFunction {
  const { windowWidth, windowCenter } = windowLevelUtil.toWindowLevel(
    voiRange.lower,
    voiRange.upper
  );

  // Function is defined by dicom spec
  // https://dicom.nema.org/medical/dicom/2018b/output/chtml/part03/sect_C.11.2.html
  const sigmoid = (x: number, wc: number, ww: number) => {
    return 1 / (1 + Math.exp((-4 * (x - wc)) / ww));
  };

  // This function is the analytical inverse of the dicom spec sigmoid function
  // for values y = [0, 1] exclusive. We use this to perform better sampling of
  // points for the LUT as some images can have 2^16 unique values. This method
  // can be deprecated if vtk supports LUTFunctions rather than look up tables
  // or if vtk supports logistic scale. It currently only supports linear and
  // log10 scaling which can be set on the vtkColorTransferFunction
  const logit = (y: number, wc: number, ww: number) => {
    return wc - (ww / 4) * Math.log((1 - y) / y);
  };

  // we slice out the first and last value to avoid 0 and 1 Infinity values
  const range = [...Array(approximationNodes + 2).keys()]
    .map((v) => v / (approximationNodes + 2))
    .slice(1, -1);
  const table = range.reduce((res, y) => {
    const x = logit(y, windowCenter, windowWidth);
    return res.concat(x, y, y, y, 0.5, 0.0);
  }, []);

  const cfun = vtkColorTransferFunction.newInstance();
  cfun.buildFunctionFromArray(
    vtkDataArray.newInstance({ values: table, numberOfComponents: 6 })
  );
  return cfun;
}
