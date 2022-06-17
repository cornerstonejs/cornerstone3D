import type vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

/**
 * Checks if a vtk Actor is an image actor (vtkVolume or vtkImageSlice) otherwise returns false.
 *
 * @param actor - actor
 * @returns A boolean value.
 */
export default function isImageActor(
  actor: vtkActor | vtkVolume | vtkImageSlice
): boolean {
  if (actor.isA('vtkVolume')) {
    return true;
  }

  if (actor.isA('vtkImageSlice')) {
    return true;
  }

  return false;
}
