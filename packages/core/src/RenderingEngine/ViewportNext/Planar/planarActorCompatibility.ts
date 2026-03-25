import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import CanvasActor from '../../CanvasActor';
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

  let uid = stackInput.actorUID;

  if (!uid && typeof stackInput.representationUID === 'string') {
    uid = stackInput.representationUID;
  }

  if (!uid && image.imageId) {
    uid = image.imageId;
  }

  return {
    uid: uid ?? uuidv4(),
    actor,
    actorMapper: {
      actor,
      mapper,
      renderMode: 'vtkImage',
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

  let uid = stackInput.actorUID;

  if (!uid && typeof stackInput.representationUID === 'string') {
    uid = stackInput.representationUID;
  }

  if (!uid && image.imageId) {
    uid = image.imageId;
  }

  return {
    uid: uid ?? uuidv4(),
    actor,
    actorMapper: {
      actor,
      mapper: actor.getMapper(),
      renderMode: 'cpu2d',
    },
    referencedId: image.imageId,
    ...stackInput,
  };
}

export function projectPlanarBindingActorEntry(
  data: LoadedData<PlanarPayload>,
  rendering: PlanarRendering
): ActorEntry | undefined {
  if (rendering.renderMode === 'cpu2d') {
    const actor = rendering.compatibilityActor;
    let uid = data.actorUID;
    let referencedId = data.referencedId;

    if (!uid && data.representationUID) {
      uid = data.representationUID;
    }

    if (!uid && referencedId) {
      uid = referencedId;
    }

    if (!uid && rendering.enabledElement.image?.imageId) {
      uid = rendering.enabledElement.image.imageId;
    }

    if (!uid) {
      uid = data.id;
    }

    if (!referencedId && rendering.enabledElement.image?.imageId) {
      referencedId = rendering.enabledElement.image.imageId;
    }

    if (!referencedId) {
      referencedId = data.id;
    }

    return {
      uid,
      actor,
      actorMapper: {
        actor,
        mapper: actor.getMapper(),
        renderMode: 'cpu2d',
      },
      referencedId,
      ...(data.representationUID
        ? { representationUID: data.representationUID }
        : {}),
    };
  }

  if (rendering.renderMode === 'vtkImage') {
    const actor = rendering.actor;
    const mapper = rendering.mapper;
    let uid = data.actorUID;
    let referencedId = data.referencedId;

    if (!uid && data.representationUID) {
      uid = data.representationUID;
    }

    if (!uid && referencedId) {
      uid = referencedId;
    }

    if (!uid) {
      uid = data.id;
    }

    if (!referencedId && rendering.currentImage.imageId) {
      referencedId = rendering.currentImage.imageId;
    }

    if (!referencedId) {
      referencedId = data.id;
    }

    return {
      uid,
      actor,
      actorMapper: {
        actor,
        mapper,
        renderMode: 'vtkImage',
      },
      referencedId,
      ...(data.representationUID
        ? { representationUID: data.representationUID }
        : {}),
    };
  }

  if (rendering.renderMode === 'vtkVolume') {
    const actor = rendering.actor;
    const mapper = rendering.mapper;
    let uid = data.actorUID;
    let referencedId = data.referencedId;

    if (!uid && data.representationUID) {
      uid = data.representationUID;
    }

    if (!uid && referencedId) {
      uid = referencedId;
    }

    if (!uid && data.volumeId) {
      uid = data.volumeId;
    }

    if (!uid) {
      uid = data.id;
    }

    if (!referencedId && data.volumeId) {
      referencedId = data.volumeId;
    }

    if (!referencedId) {
      referencedId = data.id;
    }

    return {
      uid,
      actor,
      actorMapper: {
        actor,
        mapper,
        renderMode: 'vtkVolume',
      },
      referencedId,
      ...(data.representationUID
        ? { representationUID: data.representationUID }
        : {}),
    };
  }

  if (rendering.renderMode === 'cpuVolume') {
    const actor = rendering.compatibilityActor;
    let uid = data.actorUID;
    let referencedId = data.referencedId;

    if (!uid && data.representationUID) {
      uid = data.representationUID;
    }

    if (!uid && referencedId) {
      uid = referencedId;
    }

    if (!uid && data.volumeId) {
      uid = data.volumeId;
    }

    if (!uid) {
      uid = data.id;
    }

    if (!referencedId && data.volumeId) {
      referencedId = data.volumeId;
    }

    if (!referencedId) {
      referencedId = data.id;
    }

    return {
      uid,
      actor,
      actorMapper: {
        actor,
        mapper: actor.getMapper(),
        renderMode: 'cpuVolume',
      },
      referencedId,
      ...(data.representationUID
        ? { representationUID: data.representationUID }
        : {}),
    };
  }
}
