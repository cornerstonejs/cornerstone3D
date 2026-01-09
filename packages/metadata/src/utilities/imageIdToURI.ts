/**
 * Removes the data loader scheme from the imageId
 *
 * @param imageId - Image ID
 * @returns imageId without the data loader scheme
 */
export function imageIdToURI(imageId: string): string {
  const colonIndex = imageId.indexOf(':');
  return imageId.substring(colonIndex + 1);
}

export default imageIdToURI;
