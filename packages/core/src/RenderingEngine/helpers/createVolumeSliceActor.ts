import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { resolveVolumeTexture } from './resolveVolumeTexture';
import type { ResolveVolumeTextureOptions } from './resolveVolumeTexture';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import { vtkSharedImageResliceMapper } from '../vtkClasses';
import type { ImageActor } from '../../types/IActor';
import { loadVolume } from '../../loaders/volumeLoader';
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
  viewportId: string
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

  // A render path applies its strategies after the mount, and it binds the
  // base texture then, so only a legacy caller needs a texture here.
  const usesRenderPath =
    props.provideStrategies !== undefined || props.selectStrategy !== undefined;

  if (!vtkOpenGLTexture && !usesRenderPath) {
    throw new Error(
      `no render strategy gives a texture for the volume ${volumeId}`
    );
  }

  const loadStatus = imageVolume.loadStatus as { loaded?: boolean } | undefined;
  const slicePlane = vtkPlane.newInstance();
  const mapper = vtkSharedImageResliceMapper.newInstance();

  if (vtkOpenGLTexture && (!loadStatus || loadStatus.loaded)) {
    // Force a full GPU refill when the CPU volume is already complete. Use the
    // explicit API: texture.modified() only bumps MTime and must not mark every
    // slice dirty (VTK filter setters call modified too).
    vtkOpenGLTexture.markAllFramesUpdated?.();
  }

  mapper.setInputData(imageData);
  mapper.setSlicePlane(slicePlane);
  mapper.setSlabThickness(0);

  if (vtkOpenGLTexture) {
    mapper.setScalarTexture?.(vtkOpenGLTexture);
  }
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

  return { actor, slicePlane };
}

export default createVolumeSliceActor;
