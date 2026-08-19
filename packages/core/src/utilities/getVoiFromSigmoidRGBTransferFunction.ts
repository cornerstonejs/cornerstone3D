import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

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
  const ww = Math.round((4 * (x2 - x1)) / (logy1 - logy2));
  const wc = Math.round(x1 + (ww * logy1) / 4);
  // An inverted function decreases with x, which flips the sign of the window
  // width derived above (the center is unaffected). Return the range in order
  // regardless, so callers do not get a lower bound above the upper one.
  const windowWidth = Math.abs(ww);
  return [Math.round(wc - windowWidth / 2), Math.round(wc + windowWidth / 2)];
}
