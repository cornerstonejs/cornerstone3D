import { Types } from '..';

type actorTypes = 'vtkActor' | 'vtkVolume' | 'vtkImageSlice';

/**
 * Checks if a vtk Actor is an image actor (vtkVolume or vtkImageSlice) otherwise returns false.
 *
 * @param actor - actor
 * @returns A boolean value.
 */
export function isImageActor(actorEntry: Types.ActorEntry): boolean {
  if (
    actorIsA(actorEntry, 'vtkVolume') ||
    actorIsA(actorEntry, 'vtkImageSlice')
  ) {
    return true;
  }

  return false;
}

export function actorIsA(
  actorEntry: Types.ActorEntry,
  actorType: actorTypes
): boolean {
  const actor = actorEntry.actor;

  if (actor.isA(actorType)) {
    return true;
  }

  return false;
}
