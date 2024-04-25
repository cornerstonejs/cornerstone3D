import {
  IImageData,
  IStackViewport,
  IVolumeViewport,
  Point2,
  Point3,
} from '../types';

/**
 * Given a viewport, return the corners of the image in the viewport in world coordinates.
 * Note that this is different than the corners of the canvas in world coordinates since
 * an image can be zoomed out and the canvas can be larger than the image; hence, the
 * corners of the canvas in world coordinates will be outside the image.
 *
 * @param viewport - The viewport to get the corners of.
 * @returns The corners of the image in the viewport in world coordinates.
 */
export default function getViewportImageCornersInWorld(
  viewport: IStackViewport | IVolumeViewport
): Point3[] {
  const { imageData, dimensions } = viewport.getImageData() as IImageData;
  const { canvas } = viewport;

  // we should consider the device pixel ratio since we are
  // working with canvas coordinates
  const ratio = window.devicePixelRatio;

  const topLeftCanvas: Point2 = [0, 0];
  const topRightCanvas: Point2 = [canvas.width / ratio, 0];
  const bottomRightCanvas: Point2 = [
    canvas.width / ratio,
    canvas.height / ratio,
  ];
  const bottomLeftCanvas: Point2 = [0, canvas.height / ratio];

  const topLeftWorld = viewport.canvasToWorld(topLeftCanvas);
  const topRightWorld = viewport.canvasToWorld(topRightCanvas);
  const bottomRightWorld = viewport.canvasToWorld(bottomRightCanvas);
  const bottomLeftWorld = viewport.canvasToWorld(bottomLeftCanvas);

  const topLeftImage = imageData.worldToIndex(topLeftWorld);
  const topRightImage = imageData.worldToIndex(topRightWorld);
  const bottomRightImage = imageData.worldToIndex(bottomRightWorld);
  const bottomLeftImage = imageData.worldToIndex(bottomLeftWorld);

  return _getStackViewportImageCorners({
    dimensions,
    imageData,
    topLeftImage,
    topRightImage,
    bottomRightImage,
    bottomLeftImage,
    topLeftWorld,
    topRightWorld,
    bottomRightWorld,
    bottomLeftWorld,
  });
}

function _getStackViewportImageCorners({
  dimensions,
  imageData,
  topLeftImage,
  topRightImage,
  bottomRightImage,
  bottomLeftImage,
  topLeftWorld,
  topRightWorld,
  bottomRightWorld,
  bottomLeftWorld,
}) {
  const topLeftImageWorld = _isInBounds(topLeftImage, dimensions)
    ? topLeftWorld
    : (imageData.indexToWorld([0, 0, 0]) as Point3);

  const topRightImageWorld = _isInBounds(topRightImage, dimensions)
    ? topRightWorld
    : (imageData.indexToWorld([dimensions[0] - 1, 0, 0]) as Point3);

  const bottomRightImageWorld = _isInBounds(bottomRightImage, dimensions)
    ? bottomRightWorld
    : (imageData.indexToWorld([
        dimensions[0] - 1,
        dimensions[1] - 1,
        0,
      ]) as Point3);

  const bottomLeftImageWorld = _isInBounds(bottomLeftImage, dimensions)
    ? bottomLeftWorld
    : (imageData.indexToWorld([0, dimensions[1] - 1, 0]) as Point3);

  return [
    topLeftImageWorld,
    topRightImageWorld,
    bottomLeftImageWorld,
    bottomRightImageWorld,
  ];
}

function _isInBounds(imageCoord, dimensions) {
  return (
    imageCoord[0] > 0 ||
    imageCoord[0] < dimensions[0] - 1 ||
    imageCoord[1] > 0 ||
    imageCoord[1] < dimensions[1] - 1 ||
    imageCoord[2] > 0 ||
    imageCoord[2] < dimensions[2] - 1
  );
}
