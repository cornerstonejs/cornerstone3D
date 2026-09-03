import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import VOILUTFunctionType from '../enums/VOILUTFunctionType';
import { toLowHighRange } from './windowLevel';

/**
 * Recovers the VOI range a sampled sigmoid transfer function was built from.
 *
 * The nodes hold the DICOM sigmoid (PS3.3 C.11.2.1.3.1)
 * `y = 1 / (1 + exp(-4 * (x - c) / w))`, so window width and center are solved
 * for analytically from two samples of the curve. Converting those back to a
 * range has to use the same convention as `createSigmoidRGBTransferFunction`,
 * which reads the range through `toWindowLevel` - hence `toLowHighRange` here
 * rather than a plain `c +/- w/2`. The two are exact inverses, so a range
 * survives any number of round trips unchanged. If the sigmoid branch of one of
 * them ever diverges from the linear convention, the other has to follow.
 */
export default function getVoiFromSigmoidRGBTransferFunction(
  cfun: vtkColorTransferFunction
): [number, number] {
  let cfunRange = [];
  // @ts-ignore: vtk d ts problem
  const [lower, upper] = cfun.getRange();
  cfun.getTable(lower, upper, 1024, cfunRange);
  cfunRange = cfunRange.filter((v, k) => k % 3 === 0);
  const cfunDomain = [...Array(1024).keys()].map((v, k) => {
    return lower + ((upper - lower) / (1024 - 1)) * k;
  });
  const y1 = cfunRange[256];
  const logy1 = Math.log((1 - y1) / y1);
  const x1 = cfunDomain[256];
  const y2 = cfunRange[256 * 3];
  const logy2 = Math.log((1 - y2) / y2);
  const x2 = cfunDomain[256 * 3];
  // Kept unrounded - the window center is derived from the width, and the
  // center is a half integer whenever the range bounds sum to an even number,
  // so rounding either one here would shift the range by up to one.
  const ww = (4 * (x2 - x1)) / (logy1 - logy2);
  const wc = x1 + (ww * logy1) / 4;
  // An inverted function decreases with x, which flips the sign of the window
  // width derived above (the center is unaffected). Return the range in order
  // regardless, so callers do not get a lower bound above the upper one.
  const windowWidth = Math.abs(ww);
  const { lower: voiLower, upper: voiUpper } = toLowHighRange(
    windowWidth,
    wc,
    VOILUTFunctionType.SAMPLED_SIGMOID
  );

  return [Math.round(voiLower), Math.round(voiUpper)];
}
