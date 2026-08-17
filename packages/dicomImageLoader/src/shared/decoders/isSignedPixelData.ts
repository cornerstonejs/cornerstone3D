/**
 * Whether decoded samples should be read as signed.
 *
 * Color pixel data is always unsigned: PS3.3 C.7.6.3.1.2 requires Pixel
 * Representation to be 0 for RGB and YBR images, so there is no such thing as a
 * conformant signed color frame. Encoders do get this wrong - a JPEG 2000
 * codestream that declares its three 8 bit components signed while holding
 * ordinary 0-255 RGB is what prompted this guard. Believing it produced an
 * Int8Array in which every sample above 127 read as negative, and the color
 * conversion copies into a Uint8ClampedArray, which clamps all of those to 0:
 * the bright fifth of the image turned black.
 *
 * The signed flag is compared exactly rather than tested for truthiness: the
 * WASM codecs report it as a boolean, DICOM metadata reports Pixel
 * Representation as 0 or 1, and any other value is not a claim of signedness.
 *
 * @param frameInfo - decoded frame info, as the codecs report it
 * @returns true only when the samples are both declared signed and grayscale
 */
export default function isSignedPixelData(frameInfo?: {
  isSigned?: boolean | number;
  componentCount?: number;
}): boolean {
  const declaredSigned =
    frameInfo?.isSigned === true || frameInfo?.isSigned === 1;

  return declaredSigned && frameInfo.componentCount === 1;
}
