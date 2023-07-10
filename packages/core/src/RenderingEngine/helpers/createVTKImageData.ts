import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
/**
 *
 * Creates vtkImagedata based on the image object, it creates
 * and empty scalar data for the image based on the metadata
 * tags (e.g., bitsAllocated)
 *
 * @param image - cornerstone Image object
 */
export default function createVTKImageData({
  origin,
  direction,
  dimensions,
  spacing,
  numComps,
  pixelArray,
}): vtkImageData {
  const values = new pixelArray.constructor(pixelArray.length);

  // Todo: I guess nothing should be done for use16bit?
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: numComps,
    values: values,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);
  return imageData;
}
