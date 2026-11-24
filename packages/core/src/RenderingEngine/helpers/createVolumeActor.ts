import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import type { VolumeActor } from './../../types/IActor';
import type IImageVolume from './../../types/IImageVolume';
import { loadVolume } from '../../loaders/volumeLoader';
import createVolumeMapper from './createVolumeMapper';
import { resolveVolumeTexture } from './resolveVolumeTexture';
import type { ResolveVolumeTextureOptions } from './resolveVolumeTexture';
import { claimLegacyActorTextureSet } from './legacyActorTextureSet';
import type BlendModes from '../../enums/BlendModes';
import setDefaultVolumeVOI from './setDefaultVolumeVOI';
import type { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
import { getConfiguration } from '../../init';

interface createVolumeActorInterface extends ResolveVolumeTextureOptions {
  volumeId: string;
  callback?: ({
    volumeActor,
    volumeId,
  }: {
    volumeActor: VolumeActor;
    volumeId: string;
  }) => void;
  blendMode?: BlendModes;
}

/**
 * Creates a volume actor based on the provided properties. It fires no
 * event: a viewport that mounts the volume fires
 * `DISPLAY_SET_APPEARANCE_CHANGED` with cause `'mount'`.
 *
 * @param props - The properties for creating the volume actor.
 * @param _element - Not used since 6.0, when the helper stopped firing
 * `VOI_MODIFIED` on it.
 * @param viewportId - The ID of the viewport where the volume actor will be displayed.
 * @returns A promise that resolves to the created volume actor.
 * @throws An error if the imageVolume with the specified ID does not exist.
 */
async function createVolumeActor(
  props: createVolumeActorInterface,
  _element: HTMLDivElement,
  viewportId: string
): Promise<VolumeActor> {
  const imageVolume = await loadVolume(props.volumeId);

  if (!imageVolume) {
    throw new Error(
      `imageVolume with id: ${imageVolume.volumeId} does not exist`
    );
  }

  return createVolumeActorOfVolume(imageVolume, props, viewportId);
}

/**
 * Creates the volume actor of an image volume that the caller has, as
 * `createVolumeActor` does for the volume of `props.volumeId` that it loads.
 * A render path that staged its volume passes it, so a volume that left the
 * cache meanwhile is not loaded again. Not exported from the package.
 */
export async function createVolumeActorOfVolume(
  imageVolume: IImageVolume,
  props: createVolumeActorInterface,
  viewportId: string
): Promise<VolumeActor> {
  const { volumeId, callback, blendMode } = props;
  const { imageData } = imageVolume;
  // The strategies decide which grid this actor draws. A legacy viewport has no
  // render path, so this one choice is what gives it the reduction that the
  // capability of the device requires. A render path passes its own provider
  // here and then keeps choosing on every render.
  const { strategy, texture: vtkOpenGLTexture } = resolveVolumeTexture(
    imageVolume,
    {
      provideStrategies: props.provideStrategies,
      selectStrategy: props.selectStrategy,
      viewportId,
    }
  );

  // A render path applies its strategies after the mount, and it binds the
  // base texture then, so only a legacy caller needs a texture here.
  const usesRenderPath =
    props.provideStrategies !== undefined || props.selectStrategy !== undefined;

  if (!vtkOpenGLTexture && !usesRenderPath) {
    throw new Error(
      `no render strategy gives a texture for the volume ${volumeId}`
    );
  }

  const volumeMapper = createVolumeMapper(imageData, vtkOpenGLTexture);

  if (blendMode) {
    volumeMapper.setBlendMode(blendMode as unknown as BlendMode);
  }

  const volumeActor = vtkVolume.newInstance();
  volumeActor.setMapper(volumeMapper);

  if (!usesRenderPath) {
    claimLegacyActorTextureSet(volumeActor, imageVolume, strategy.name);
  }

  // Todo: fix this for 3D RGB
  const { numberOfComponents } = imageData.get('numberOfComponents') as {
    numberOfComponents: number;
  };

  const volumeProperty = volumeActor.getProperty();
  volumeProperty.set({ viewportId: viewportId }, true);

  if (getConfiguration().rendering.preferSizeOverAccuracy) {
    // @ts-expect-error: vtk.js typing is missing this method
    volumeProperty.setPreferSizeOverAccuracy(true);
  }

  if (numberOfComponents === 3) {
    volumeActor.getProperty().setIndependentComponents(false);
  }

  await setDefaultVolumeVOI(volumeActor, imageVolume);

  if (callback) {
    callback({ volumeActor, volumeId });
  }

  return volumeActor;
}

export default createVolumeActor;
