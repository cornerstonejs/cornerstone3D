import createViewport from './createViewport';
import getImageFitScale from './getImageFitScale';
import {
  IImage,
  CPUFallbackColormap,
  CPUFallbackViewport,
} from '../../../../types';

/**
 * Creates a new viewport object containing default values for the image and canvas
 *
 * @param canvas - A Canvas DOM element
 * @param image - A Cornerstone Image Object
 * @returns viewport - object
 */
export default function (
  canvas: HTMLCanvasElement,
  image: IImage,
  modality?: string,
  colormap?: CPUFallbackColormap
): CPUFallbackViewport {
  if (canvas === undefined) {
    throw new Error(
      'getDefaultViewport: parameter canvas must not be undefined'
    );
  }

  if (image === undefined) {
    return createViewport();
  }

  // Fit image to window
  const scale = getImageFitScale(canvas, image, 0).scaleFactor;

  let voi;

  if (modality === 'PT' && image.isPreScaled) {
    voi = {
      windowWidth: 5,
      windowCenter: 2.5,
    };
  } else if (
    image.windowWidth !== undefined &&
    image.windowCenter !== undefined
  ) {
    voi = {
      windowWidth: Array.isArray(image.windowWidth)
        ? image.windowWidth[0]
        : image.windowWidth,
      windowCenter: Array.isArray(image.windowCenter)
        ? image.windowCenter[0]
        : image.windowCenter,
    };
  }

  return {
    scale,
    translation: {
      x: 0,
      y: 0,
    },
    voi,
    invert: image.invert,
    pixelReplication: false,
    rotation: 0,
    hflip: false,
    vflip: false,
    modalityLUT: image.modalityLUT,
    modality,
    voiLUT: image.voiLUT,
    colormap: colormap !== undefined ? colormap : image.colormap,
    displayedArea: {
      tlhc: {
        x: 1,
        y: 1,
      },
      brhc: {
        x: image.columns,
        y: image.rows,
      },
      rowPixelSpacing:
        image.rowPixelSpacing === undefined ? 1 : image.rowPixelSpacing,
      columnPixelSpacing:
        image.columnPixelSpacing === undefined ? 1 : image.columnPixelSpacing,
      presentationSizeMode: 'NONE',
    },
  };
}
