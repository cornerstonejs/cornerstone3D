import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getConfiguration } from '../../init';
/**
 * Creates imageMapper based on the provided vtkImageData and also creates
 * the imageSliceActor and connects it to the imageMapper.
 * For color stack images, it sets the independent components to be false which
 * is required in vtk.
 *
 * @param imageData - vtkImageData for the viewport
 * @returns actor vtkActor
 */
export default function createActorMapper(
  imageData: vtkImageData
): vtkImageSlice {
  const mapper = vtkImageMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkImageSlice.newInstance();

  actor.setMapper(mapper);

  const { preferSizeOverAccuracy } = getConfiguration().rendering;

  if (preferSizeOverAccuracy) {
    // @ts-ignore for now until vtk is updated
    mapper.setPreferSizeOverAccuracy(true);
  }

  if (imageData.getPointData().getNumberOfComponents() > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  return actor;
}
