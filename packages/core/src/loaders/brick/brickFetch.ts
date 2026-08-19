import type { FetchBrickFn } from './types';

/**
 * Supplies request headers for a brick URL, typically an auth token.
 *
 * Deliberately simpler than the loader `beforeSend` hooks in
 * `dicomImageLoader` and `nifti-volume-loader`, which take an `XMLHttpRequest`
 * and disagree with each other on argument order. The wiring layer adapts
 * whichever it needs.
 */
export type BrickHeadersFn = (
  url: string
) => Promise<Record<string, string>> | Record<string, string> | void;

export interface BrickFetcherOptions {
  headers?: Record<string, string>;
  getHeaders?: BrickHeadersFn;
}

/**
 * Builds a brick fetcher that de-duplicates concurrent requests for the same
 * URL.
 *
 * De-duplication matters because several viewports can ask for the same brick
 * in the same frame — an axial and a sagittal plane share the brick where they
 * cross.
 *
 * Note this deliberately calls the header hook on every request. `rangeRequest`
 * in `dicomImageLoader` has a `/* beforeSendHeaders *\/` comment where that
 * call should be and never makes it, so range requests there go out
 * unauthenticated; do not copy that.
 */
export function createBrickFetcher(
  options: BrickFetcherOptions = {}
): FetchBrickFn {
  const inFlight = new Map<string, Promise<Uint8Array>>();

  return function fetchBrick(
    url: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const existing = inFlight.get(url);

    if (existing) {
      return existing;
    }

    const request = (async () => {
      const extra = (await options.getHeaders?.(url)) || {};
      const response = await fetch(url, {
        signal,
        headers: { ...options.headers, ...extra },
      });

      if (!response.ok) {
        throw new Error(
          `[brick] Failed to fetch ${url}: ${response.status} ${response.statusText}`
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    })();

    inFlight.set(url, request);

    // Clear on settle either way, so a transient failure does not poison the
    // URL for the rest of the session.
    void request.finally(() => {
      if (inFlight.get(url) === request) {
        inFlight.delete(url);
      }
    });

    return request;
  };
}
