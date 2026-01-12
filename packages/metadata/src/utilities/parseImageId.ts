export interface CornerstoneImageUrl {
  scheme: string;
  url: string;
  frame: number;
  pixelDataFrame: number;
}

function parseImageId(imageId: string): CornerstoneImageUrl {
  // build a url by parsing out the url scheme and frame index from the imageId
  const firstColonIndex = imageId.indexOf(':');

  let url = imageId.substring(firstColonIndex + 1);
  const frameIndex = url.indexOf('frame=');

  let frame;

  if (frameIndex !== -1) {
    const frameStr = url.substring(frameIndex + 6);

    frame = parseInt(frameStr, 10);
    url = url.substring(0, frameIndex - 1);
  }

  const scheme = imageId.substring(0, firstColonIndex);
  /**
   * Why we adjust frameNumber? since in the above we are extracting the
   * frame number from the imageId (from the metadata), and the frame number
   * starts from 1, but in the loader which uses the dicomParser
   * the frame number starts from 0.
   */

  const adjustedFrame = frame !== undefined ? frame - 1 : undefined;

  return {
    scheme,
    url,
    frame,
    pixelDataFrame: adjustedFrame,
  };
}

export default parseImageId;
