// This function is the analytical inverse of the dicom spec sigmoid function
// for values y = [0, 1] exclusive. We use this to perform better sampling of
// points for the LUT as some images can have 2^16 unique values. This method
// can be deprecated if vtk supports LUTFunctions rather than look up tables
// or if vtk supports logistic scale. It currently only supports linear and
// log10 scaling which can be set on the vtkColorTransferFunction
export const logit = (y: number, wc: number, ww: number): number => {
  return wc - (ww / 4) * Math.log((1 - y) / y);
};
