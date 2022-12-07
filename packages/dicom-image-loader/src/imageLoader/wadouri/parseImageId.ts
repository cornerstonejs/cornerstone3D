function parseImageId(imageId) {
  // build a url by parsing out the url scheme and frame index from the imageId
  const firstColonIndex = imageId.indexOf(':');

  let url = imageId.substring(firstColonIndex + 1);
  const frameIndex = url.indexOf('frame=');

  let frame;

  if (frameIndex !== -1) {
    const frameStr = url.substr(frameIndex + 6);

    frame = parseInt(frameStr, 10);
    url = url.substr(0, frameIndex - 1);
  }

  return {
    scheme: imageId.substr(0, firstColonIndex),
    url,
    frame,
  };
}

export default parseImageId;
