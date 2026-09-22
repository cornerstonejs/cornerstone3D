import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { resolveVolumeTexture } from './resolveVolumeTexture';
import type { ResolveVolumeTextureOptions } from './resolveVolumeTexture';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { vtkSharedImageResliceMapper } from '../vtkClasses';
import type { ImageActor } from '../../types/IActor';
import type { VoiModifiedEventDetail } from '../../types/EventTypes';
import { loadVolume } from '../../loaders/volumeLoader';
import triggerEvent from '../../utilities/triggerEvent';
import { Events } from '../../enums';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';

interface CreateVolumeSliceActorOptions extends ResolveVolumeTextureOptions {
  volumeId: string;
  callback?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: ImageActor;
    volumeId: string;
  }) => void;
}

async function createVolumeSliceActor(
  props: CreateVolumeSliceActorOptions,
  element: HTMLDivElement,
  viewportId: string,
  suppressEvents = false
): Promise<{ actor: ImageActor; slicePlane: vtkPlane }> {
  const { volumeId, callback } = props;
  const imageVolume = await loadVolume(volumeId);

  if (!imageVolume) {
    throw new Error(`imageVolume with id: ${volumeId} does not exist`);
  }

  const { imageData } = imageVolume;
  // The strategies decide which grid this actor draws. A legacy viewport has no
  // render path, so this one choice is what gives it the reduction that the
  // capability of the device requires. A render path passes its own provider
  // here and then keeps choosing on every render.
  const { texture: vtkOpenGLTexture } = resolveVolumeTexture(imageVolume, {
    provideStrategies: props.provideStrategies,
    selectStrategy: props.selectStrategy,
    viewportId,
  });

  if (!vtkOpenGLTexture) {
    throw new Error(
      `no render strategy gives a texture for the volume ${volumeId}`
    );
  }

  const loadStatus = imageVolume.loadStatus as { loaded?: boolean } | undefined;
  const slicePlane = vtkPlane.newInstance();
  const mapper = vtkSharedImageResliceMapper.newInstance();

  if (!loadStatus || loadStatus.loaded) {
    vtkOpenGLTexture.modified();
  }

  mapper.setInputData(imageData);
  mapper.setSlicePlane(slicePlane);
  mapper.setSlabThickness(0);
  mapper.setScalarTexture?.(vtkOpenGLTexture);
  mapper.modified();

  const actor = vtkImageSlice.newInstance();
  actor.setMapper(mapper);

  const imageDataMetadata = imageData.get('numberOfComponents') as
    | { numberOfComponents?: number }
    | undefined;
  const numberOfComponents = imageDataMetadata?.numberOfComponents ?? 1;

  if (numberOfComponents > 1) {
    actor.getProperty().setIndependentComponents(false);
  }

  const imageProperty = actor.getProperty();
  imageProperty.set({ viewportId }, true);

  await setDefaultVolumeVOI(actor, imageVolume);

  const defaultWindow = imageProperty.getColorWindow?.();
  const defaultLevel = imageProperty.getColorLevel?.();

  if (defaultWindow === 255 && defaultLevel === 127.5) {
    const scalarRange = imageVolume.voxelManager?.getRange?.();

    if (scalarRange?.length === 2) {
      imageProperty.setColorWindow(scalarRange[1] - scalarRange[0]);
      imageProperty.setColorLevel((scalarRange[1] + scalarRange[0]) / 2);
    }
  }

  if (callback) {
    callback({ volumeActor: actor, volumeId });
  }

  if (!suppressEvents) {
    triggerVOIModified(element, viewportId, actor, volumeId);
  }

  return { actor, slicePlane };
}

function triggerVOIModified(
  element: HTMLDivElement,
  viewportId: string,
  actor: ImageActor,
  volumeId: string
) {
  const transferFunction = actor.getProperty().getRGBTransferFunction(0);

  if (!transferFunction) {
    return;
  }

  const voiRange = transferFunction.getRange();
  const voiModifiedEventDetail: VoiModifiedEventDetail = {
    viewportId,
    range: {
      lower: voiRange[0],
      upper: voiRange[1],
    },
    volumeId,
  };

  triggerEvent(element, Events.VOI_MODIFIED, voiModifiedEventDetail);
}

export default createVolumeSliceActor;
