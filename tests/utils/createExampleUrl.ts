const DEFAULT_EXAMPLE_BASE_URL = 'http://localhost:3333';

function normalizeBaseURL(baseURL: string): string {
  return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
}

export function createExampleUrl(path: string): URL {
  return new URL(
    path,
    normalizeBaseURL(
      process.env.PLAYWRIGHT_BASE_URL ||
        process.env.PLAYWRIGHT_EXAMPLE_BASE_URL ||
        DEFAULT_EXAMPLE_BASE_URL
    )
  );
}
