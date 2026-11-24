import ViewportType from '../../enums/ViewportType';

/**
 * The prefix of the made-up frame of reference UID of each built-in viewport
 * type: its 5.x type string, so that annotations stored on such data in 5.x
 * still match.
 */
const frameOfReferencePrefixByViewportType: Readonly<Record<string, string>> = {
  [ViewportType.PLANAR]: 'planarNext',
  [ViewportType.VOLUME_3D]: 'volume3dNext',
  [ViewportType.VIDEO]: 'videoNext',
  [ViewportType.WHOLE_SLIDE]: 'wholeSlideNext',
  [ViewportType.ECG]: 'ecgNext',
};

/**
 * The frame of reference UID that a viewport makes up when its data has
 * none: `<type>-viewport-<viewport id>`. A built-in type writes its 5.x
 * string (`planarNext-viewport-<id>`), so that annotations stored on such
 * data in 5.x still match in 6.x. A planar viewport uses it only when it has
 * no data: it makes up the frame of reference of images without one from
 * the images.
 */
export function getViewportLocalFrameOfReferenceUID(
  viewportType: string,
  viewportId: string
): string {
  const prefix = Object.prototype.hasOwnProperty.call(
    frameOfReferencePrefixByViewportType,
    viewportType
  )
    ? frameOfReferencePrefixByViewportType[viewportType]
    : viewportType;

  return `${prefix}-viewport-${viewportId}`;
}
