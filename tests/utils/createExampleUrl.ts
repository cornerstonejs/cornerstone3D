const DEFAULT_EXAMPLE_BASE_URL = 'http://localhost:3333';

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
}

/**
 * What the test process asks about slice first for every example it opens:
 * `PLAYWRIGHT_SLICE_FIRST=0` or `false` turns it off, `1` or `true` turns it
 * on, and anything else leaves the default of the library, which is on.
 */
export function getForcedSliceFirst(): boolean | undefined {
  const value = process.env.PLAYWRIGHT_SLICE_FIRST;

  if (value === '1' || value === 'true') {
    return true;
  }

  if (value === '0' || value === 'false') {
    return false;
  }
}

/** Adds the slice first parameter that the test process asks for, if any. */
export function setForcedSliceFirst(url: URL): void {
  const sliceFirst = getForcedSliceFirst();

  if (sliceFirst !== undefined) {
    url.searchParams.set('sliceFirst', sliceFirst ? '1' : '0');
  }
}

export function createExampleUrl(path: string): URL {
  const url = new URL(
    path,
    normalizeBaseURL(
      process.env.PLAYWRIGHT_BASE_URL ||
        process.env.PLAYWRIGHT_EXAMPLE_BASE_URL ||
        DEFAULT_EXAMPLE_BASE_URL
    )
  );

  setForcedSliceFirst(url);

  return url;
}
