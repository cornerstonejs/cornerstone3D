import ViewportType from '../../enums/ViewportType';

/**
 * The 5.x type string of each built-in viewport type, by the plain type.
 * In 6.x each 5.x string is a deprecated alias of its plain type.
 */
const deprecatedStringByViewportType: Readonly<Record<string, string>> = {
  [ViewportType.PLANAR]: 'planarNext',
  [ViewportType.VOLUME_3D]: 'volume3dNext',
  [ViewportType.VIDEO]: 'videoNext',
  [ViewportType.WHOLE_SLIDE]: 'wholeSlideNext',
  [ViewportType.ECG]: 'ecgNext',
};

/**
 * The plain viewport type of each deprecated 5.x type string
 * (`'planarNext'` gives `'planar'`, and so on).
 */
export const viewportTypeByDeprecatedString: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(deprecatedStringByViewportType).map(
      ([viewportType, deprecatedString]) => [deprecatedString, viewportType]
    )
  );

/**
 * Gives the plain viewport type of a deprecated 5.x type string, and any
 * other string as it is.
 */
export function resolveDeprecatedViewportType(type: string): string {
  return Object.prototype.hasOwnProperty.call(
    viewportTypeByDeprecatedString,
    type
  )
    ? viewportTypeByDeprecatedString[type]
    : type;
}

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
    deprecatedStringByViewportType,
    viewportType
  )
    ? deprecatedStringByViewportType[viewportType]
    : viewportType;

  return `${prefix}-viewport-${viewportId}`;
}
