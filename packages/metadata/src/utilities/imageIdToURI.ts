const schemePrefixPattern = /^[a-zA-Z]+:/;

/**
 * Removes the data loader scheme from the imageId
 *
 * @param imageId - Image ID
 * @returns imageId without the data loader scheme, or empty string if imageId is falsy
 */
export default function imageIdToURI(imageId: string): string {
  if (!imageId) {
    return '';
  }

  const firstPrefixMatch = imageId.match(schemePrefixPattern);

  if (!firstPrefixMatch) {
    return imageId;
  }

  const remainder = imageId.substring(firstPrefixMatch[0].length);

  // Only strip one scheme if another scheme-like prefix remains.
  // Example: wadouri:derived:uuid -> derived:uuid
  // Example: derived:uuid -> derived:uuid
  if (!schemePrefixPattern.test(remainder)) {
    return imageId;
  }

  return remainder;
}
