const DEFAULT_EXAMPLE_BASE_URL = 'http://localhost:3333';

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
}

/**
 * Whether the test process asks for slice first on every example it opens:
 * `PLAYWRIGHT_SLICE_FIRST=1` or `true`. Off by default.
 */
export function shouldForceSliceFirst(): boolean {
  const value = process.env.PLAYWRIGHT_SLICE_FIRST;

  return value === '1' || value === 'true';
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

  if (shouldForceSliceFirst()) {
    url.searchParams.set('sliceFirst', '1');
  }

  return url;
}
