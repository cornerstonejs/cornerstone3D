import type {
  IStackViewport,
  IStreamingImageVolume,
  IVolumeViewport,
  Point3,
} from '../types';
import { setVolumesForViewports } from '../RenderingEngine/helpers';
import {
  createAndCacheVolume,
  getUnknownVolumeLoaderSchema,
} from '../loaders/volumeLoader';
import type { OrientationAxis } from '../enums';
import { Events, ViewportType } from '../enums';
import uuidv4 from './uuidv4';

/**
 * Converts a stack viewport to a volume viewport.
 *
 * @param params - The parameters for the conversion.
 * @param params.viewport - The stack viewport to convert.
 * @param params.options - The options for the conversion.
 * @param [params.options.volumeId] - The volumeId that will get generated, it should have the volume loader schema defined if not we will use the default one.
 * @param [params.options.viewportId] - The viewportId that will get used for new viewport. If not provided, the stack viewport id will be used.
 * @param [params.options.background] - The background color of the volume viewport.
 * @returns The converted volume viewport.
 */
async function convertStackToVolumeViewport({
  viewport,
  options = {},
}: {
  viewport: IStackViewport;
  options?: {
    volumeId?: string;
    viewportId?: string;
    background?: Point3;
    orientation?: OrientationAxis;
  };
}): Promise<IVolumeViewport> {
  const renderingEngine = viewport.getRenderingEngine();

  let volumeId = options.volumeId || `${uuidv4()}`;

  // if there is no loader schema for the volume Id, we will use the default one
  // which we can get from the volume loader
  if (volumeId.split(':').length === 0) {
    const schema = getUnknownVolumeLoaderSchema();
    volumeId = `${schema}:${volumeId}`;
  }

  const { id, element } = viewport;
  const viewportId = options.viewportId || id;

  const imageIds = viewport.getImageIds();

  // It is important to keep the camera before enabling the viewport
  const prevViewPresentation = viewport.getViewPresentation();
  const prevViewReference = viewport.getViewReference();

  // this will disable the stack viewport and remove it from the toolGroup
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      background: options.background,
      orientation: options.orientation,
    },
  });

  // Ideally here we should be able to just create a local volume and not use the
  // volume louder but we don't know if the stack is already pre-cached for all its
  // imageIds or not so we just let the loader handle it and we have cache
  // optimizations in place to avoid fetching the same imageId if it is already
  // cached
  const volume = (await createAndCacheVolume(volumeId, {
    imageIds,
  })) as IStreamingImageVolume;

  volume.load();

  // we should get the new viewport from the renderingEngine since the stack viewport
  // was disabled and replaced with a volume viewport of the same id
  const volumeViewport = renderingEngine.getViewport(
    viewportId
  ) as IVolumeViewport;

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
      },
    ],
    [viewportId]
  );

  const volumeViewportNewVolumeHandler = () => {
    volumeViewport.render();

    element.removeEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      volumeViewportNewVolumeHandler
    );
  };

  const addVolumeViewportNewVolumeListener = () => {
    element.addEventListener(
      Events.VOLUME_VIEWPORT_NEW_VOLUME,
      volumeViewportNewVolumeHandler
    );
  };

  addVolumeViewportNewVolumeListener();

  volumeViewport.setViewPresentation(prevViewPresentation);
  volumeViewport.setViewReference(prevViewReference);

  volumeViewport.render();

  return volumeViewport;
}

export { convertStackToVolumeViewport };
