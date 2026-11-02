/**
 * Resolves a path against the base the *application* is served from, rather
 * than against the current document.
 *
 * A document-relative path resolves against the current route, so it only finds
 * what it is looking for while the page happens to sit at the right depth. An
 * application served from `/viewer/dicomweb` that asks for `assets/x` requests
 * `/viewer/assets/x` and receives whatever the SPA fallback answers with, which
 * for a binary asset means a corrupt file rather than an error. Anything an
 * application stores beside its bundle and fetches by name — wasm binaries
 * above all, since `WebAssembly.instantiateStreaming` reports the resulting
 * `index.html` as a magic-word failure — has to be resolved against the
 * application instead.
 *
 * `PUBLIC_URL` is where that base comes from: the value an application already
 * injects to say where it is mounted, defaulting to the server root.
 */

/**
 * Declared because `process` does not exist in a browser, and the bundlers that
 * substitute `process.env.PUBLIC_URL` do it by matching that exact expression —
 * so it has to be spelled out rather than reached through `globalThis`.
 */
declare const process: { env: Record<string, string | undefined> };

/** Base assumed when nothing declares one: applications sit at the root. */
export const DEFAULT_PUBLIC_URL = '/';

/**
 * `PUBLIC_URL` as a build-time substitution (Create React App and friends).
 *
 * A `typeof process !== 'undefined'` guard would be the obvious way to write
 * this and does not work: bundlers rewrite `process.env.PUBLIC_URL` but leave
 * the `typeof` check alone, and it is false in every browser bundle, so the
 * substituted value would never be read. Catching the reference error is what
 * is left.
 */
function getBuildTimePublicUrl(): string | undefined {
  try {
    return process.env.PUBLIC_URL || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The base the application declares for itself, defaulting to the server root.
 *
 * `PUBLIC_URL` on the global is the runtime spelling
 * `utils/demo/helpers/initDemo.ts` sets and `dicom-microscopy-viewer` reads;
 * `config.path` is the same value carried in a viewer's configuration object.
 */
export function getPublicUrl(): string {
  const globals = globalThis as {
    PUBLIC_URL?: string;
    config?: { path?: string };
  };

  return (
    globals.PUBLIC_URL ||
    globals.config?.path ||
    getBuildTimePublicUrl() ||
    DEFAULT_PUBLIC_URL
  );
}

/**
 * The page's origin, and nothing else. `PUBLIC_URL` is usually a path
 * (`/pacs/`) and needs something absolute to resolve against, but the route is
 * exactly what must stay out of the result — so hand over the protocol and host
 * alone rather than `location.href` or `document.baseURI`.
 */
function getOrigin(): string | undefined {
  const { location } = globalThis;

  return location ? `${location.protocol}//${location.host}` : undefined;
}

/**
 * Resolves a path against the application's base.
 *
 * @param path - a relative path is relative to the application, an absolute
 *   path is relative to the server root, and a full URL (a CDN) is used as
 *   given. An empty path yields the application's base itself.
 * @returns an absolute URL, or `path` unchanged when there is nothing to
 *   resolve it against (a non-browser context).
 */
export default function resolveApplicationUrl(path = ''): string {
  const publicUrl = getPublicUrl();
  // `PUBLIC_URL=/pacs` is a common spelling, and URL resolution would treat
  // that last segment as a file name and discard it.
  const base = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`;
  const origin = getOrigin();

  try {
    return new URL(path, origin ? new URL(base, origin) : new URL(base)).href;
  } catch {
    return path;
  }
}
