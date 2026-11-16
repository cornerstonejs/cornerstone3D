import { Events, MetadataModules, RequestType } from '../../../enums';
import eventTarget from '../../../eventTarget';
import { loadAndCacheImage } from '../../../loaders/imageLoader';
import type { ImageLoaderOptions } from '../../../loaders/imageLoader';
import { createProgressive } from '../../../loaders/ProgressiveRetrieveImages';
import * as metaData from '../../../metaData';
import type {
  IImage,
  IImagesLoader,
  IRetrieveConfiguration,
  ImageLoadListener,
} from '../../../types';
import imageRetrieveMetadataProvider from '../../../utilities/imageRetrieveMetadataProvider';
import { coreLog } from '../../../utilities/logger';
import triggerEvent from '../../../utilities/triggerEvent';

const log = coreLog.getLogger('RenderingEngine', 'planarStackImageLoad');

/** What `loadPlanarStackImage` needs to load one image of a stack. */
export type PlanarStackImageLoadArgs = {
  imageIds: string[];
  imageIdIndex: number;
  /** Gets the first image that arrives for the index. */
  onImage: (image: IImage) => unknown;
  /** Called once when the load of the image fails for good. */
  onError?: (error: unknown) => void;
};

/**
 * The loader of the images of a stack, as the legacy stack viewport chooses
 * it: the loader of the image retrieve configuration of the stack, which is
 * the progressive loader unless the configuration gives its own `create`.
 * Undefined when the image retrieve metadata provider has no configuration
 * for the image or for `stack`.
 */
export function getPlanarStackImagesLoader(
  imageId: string
): IImagesLoader | undefined {
  const configuration = metaData.get(
    imageRetrieveMetadataProvider.IMAGE_RETRIEVE_CONFIGURATION,
    imageId,
    'stack'
  ) as
    | (IRetrieveConfiguration & {
        create?: (configuration: IRetrieveConfiguration) => IImagesLoader;
      })
    | undefined;

  if (!configuration) {
    return;
  }

  return (configuration.create || createProgressive)(configuration);
}

/**
 * The options of the image loader for an image of a stack, as the legacy
 * stack viewport gives them: the transfer syntax of the image, an
 * interaction request of priority 5 and the image id with its index.
 */
export function getPlanarStackLoaderImageOptions(
  imageIds: string[],
  imageId: string
): ImageLoaderOptions {
  const { transferSyntaxUID } =
    (metaData.get(MetadataModules.TRANSFER_SYNTAX, imageId) as
      | { transferSyntaxUID?: string }
      | undefined) || {};

  return {
    useRGBA: false,
    transferSyntaxUID,
    priority: 5,
    requestType: RequestType.Interaction,
    additionalDetails: { imageId, imageIdIndex: imageIds.indexOf(imageId) },
  } as ImageLoaderOptions;
}

/**
 * Loads one image of a stack as the legacy stack viewport loads it: through
 * the loader of the image retrieve configuration of the stack when there is
 * one, else with `loadAndCacheImage` and the options of
 * `getPlanarStackLoaderImageOptions`. `onImage` gets the first image that
 * arrives; the better stages of a progressive load come after it as
 * IMAGE_LOADED events. A load that fails for good fires IMAGE_LOAD_ERROR on
 * the event target with the legacy detail `{ error, imageIdIndex, imageId }`
 * and calls `onError`.
 *
 * @returns a promise that resolves when the load and `onImage` are done. It
 * resolves also when the load fails.
 */
export function loadPlanarStackImage({
  imageIds,
  imageIdIndex,
  onImage,
  onError,
}: PlanarStackImageLoadArgs): Promise<void> {
  const imageId = imageIds[imageIdIndex];
  let shown: Promise<unknown> = Promise.resolve();
  let delivered = false;
  let failed = false;
  const listener: ImageLoadListener = {
    successCallback: (_loadedImageId, image: IImage) => {
      if (delivered) {
        return;
      }

      delivered = true;

      try {
        shown = Promise.resolve(onImage(image));
      } catch (error) {
        shown = Promise.reject(error);
      }
    },
    errorCallback: (_failedImageId, permanent: boolean, error: unknown) => {
      if (!permanent || failed) {
        return;
      }

      failed = true;
      triggerEvent(eventTarget, Events.IMAGE_LOAD_ERROR, {
        error,
        imageIdIndex,
        imageId,
      });
      onError?.(error);
    },
    getLoaderImageOptions: (loadImageId) => ({
      ...getPlanarStackLoaderImageOptions(imageIds, loadImageId),
    }),
  };
  const imagesLoader = getPlanarStackImagesLoader(imageId);
  const loading = imagesLoader
    ? imagesLoader.loadImages([imageId], listener)
    : loadAndCacheImage(
        imageId,
        getPlanarStackLoaderImageOptions(imageIds, imageId)
      ).then(
        (image) => listener.successCallback(imageId, image),
        (error) => listener.errorCallback(imageId, true, error)
      );

  return Promise.resolve(loading)
    .catch((error) => listener.errorCallback(imageId, true, error))
    .then(() => shown)
    .then(
      () => undefined,
      (error) => {
        log.warn(`Showing the image ${imageId} failed`, error);
      }
    );
}
