import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import CanvasActor from '../../CanvasActor';
import { ActorRenderMode } from '../../../types';
import type { ActorEntry, IImage, IStackInput } from '../../../types';
import type { IViewport } from '../../../types/IViewport';
import uuidv4 from '../../../utilities/uuidv4';
import { createVTKImageDataFromImage } from '../../helpers/planarImageRendering';
import type { LoadedData } from '../ViewportArchitectureTypes';
import type { PlanarPayload } from './PlanarViewportTypes';
import type { PlanarRendering } from './planarRuntimeTypes';

export function createPlanarImageOverlayActorEntry(
  image: IImage,
  stackInput: IStackInput
): ActorEntry {
  const mapper = vtkImageMapper.newInstance();
  const actor = vtkImageSlice.newInstance();
  const imageData = createVTKImageDataFromImage(image);

  mapper.setInputData(imageData);
  actor.setMapper(mapper);

  if (typeof stackInput.visibility === 'boolean') {
    actor.setVisibility(stackInput.visibility);
  }

  return {
    uid: uuidv4(),
    actor,
    actorMapper: {
      actor,
      mapper,
      renderMode: ActorRenderMode.VTK_IMAGE,
    },
    referencedId: image.imageId,
    ...stackInput,
  };
}

export function createPlanarCpuImageOverlayActorEntry(
  viewport: IViewport,
  image: IImage,
  stackInput: IStackInput
): ActorEntry {
  const actor = new CanvasActor(viewport, image);

  actor.setVisibility(
    typeof stackInput.visibility === 'boolean' ? stackInput.visibility : true
  );

  return {
    uid: uuidv4(),
    actor,
    actorMapper: {
      actor,
      mapper: actor.getMapper(),
      renderMode: ActorRenderMode.CPU_IMAGE,
    },
    referencedId: image.imageId,
    ...stackInput,
  };
}
