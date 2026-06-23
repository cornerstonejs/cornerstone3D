import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

const windowWidth = 400;
const windowCenter = 40;

const lower = windowCenter - windowWidth / 2.0;
const upper = windowCenter + windowWidth / 2.0;

const ctVoiRange = { lower, upper };

export default function setCtTransferFunctionForVolumeActor({ volumeActor }) {
  const property = volumeActor.getProperty();
  const transferFunction = ensureRGBTransferFunction(property);

  transferFunction.setMappingRange(lower, upper);
}

export { ctVoiRange };

function ensureRGBTransferFunction(property) {
  let transferFunction = property.getRGBTransferFunction(0);

  if (transferFunction) {
    return transferFunction;
  }

  transferFunction = vtkColorTransferFunction.newInstance();
  transferFunction.addRGBPoint(0, 0, 0, 0);
  transferFunction.addRGBPoint(1, 1, 1, 1);
  property.setRGBTransferFunction(0, transferFunction);
  property.setUseLookupTableScalarRange?.(true);

  return transferFunction;
}
