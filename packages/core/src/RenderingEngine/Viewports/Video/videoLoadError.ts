const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: 'MEDIA_ERR_ABORTED',
  2: 'MEDIA_ERR_NETWORK',
  3: 'MEDIA_ERR_DECODE',
  4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
};

/**
 * The error of a video mount whose element failed to load: it names the
 * display set, the URL of the video and the media error of the element
 * (its code and the browser's message), and has the `MediaError` as its
 * `cause`. A `data:` URL is cut after its media type.
 *
 * @internal
 */
export function videoLoadError(
  displaySetId: string,
  element: HTMLVideoElement
): Error {
  const mediaError = element.error;
  const name =
    MEDIA_ERROR_NAMES[mediaError?.code] ??
    (mediaError ? `media error ${mediaError.code}` : 'unknown media error');
  const detail = mediaError?.message ? ` (${mediaError.message})` : '';
  const url = element.currentSrc || element.src;
  const shownUrl = url.startsWith('data:')
    ? `${url.slice(0, url.indexOf(',') + 1)}...`
    : url;

  return new Error(
    `[VideoViewport] The display set "${displaySetId}" did not load its video ${shownUrl}: ${name}${detail}`,
    { cause: mediaError }
  );
}
