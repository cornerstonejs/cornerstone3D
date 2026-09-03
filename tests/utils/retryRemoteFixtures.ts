import type { APIResponse, Page, Route } from '@playwright/test';

const DEFAULT_HOSTS = [/raw\.githubusercontent\.com/];

interface RetryRemoteFixturesOptions {
  /** Total attempts (including the first) before giving up. Default 4. */
  attempts?: number;
  /** Host patterns to intercept. Default: raw.githubusercontent.com. */
  hosts?: RegExp[];
  /** Per-attempt fetch timeout in ms. Default 20000. */
  perAttemptTimeoutMs?: number;
}

/**
 * DICOM fixtures for the loader examples are fetched over HTTP from
 * raw.githubusercontent.com — most images from the cornerstone3D repo, the
 * TG18 set from the external OHIF/viewer-testdata repo. Under the parallel
 * Playwright workers on the self-hosted runner, GitHub raw intermittently
 * rate-limits (429) or drops these requests. The loader issues a single
 * XMLHttpRequest per image with no retry (see
 * packages/dicomImageLoader/src/imageLoader/internal/xhrRequest.ts), so one
 * bad response fails the whole image load and surfaces as a flaky
 * `waitForImageRendered` timeout.
 *
 * Intercept those requests and retry them with exponential backoff from the
 * Node side via `route.fetch`, then replay the successful response to the
 * browser. Retries happen off the browser's single-shot XHR, the product code
 * is untouched, and the example's public URLs are left as-is so the deployed
 * docs demo is unaffected. Range requests are preserved because `route.fetch`
 * forwards the original request (headers included).
 *
 * Install in a spec's `beforeEach` BEFORE navigating to the example.
 */
export async function retryRemoteFixtures(
  page: Page,
  options: RetryRemoteFixturesOptions = {}
): Promise<void> {
  const {
    attempts = 4,
    hosts = DEFAULT_HOSTS,
    perAttemptTimeoutMs = 20000,
  } = options;

  await page.route(
    (url) => hosts.some((host) => host.test(url.href)),
    async (route: Route) => {
      let lastResponse: APIResponse | undefined;

      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const response = await route.fetch({ timeout: perAttemptTimeoutMs });
          const status = response.status();

          // Only 429 and 5xx are transient; anything else (2xx, 3xx, 4xx
          // other than 429) is a real answer we should replay immediately.
          if (status !== 429 && status < 500) {
            await route.fulfill({ response });
            return;
          }

          lastResponse = response;
        } catch {
          // Network error / timeout: fall through to backoff and retry.
        }

        // Backoff after every failed attempt except when we are about to give
        // up, so the caller's render-gate budget is not spent needlessly.
        if (attempt < attempts - 1) {
          const backoffMs = 500 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      // Retries exhausted. Replay the last transient response if we have one,
      // otherwise let the request proceed so the real network error surfaces.
      if (lastResponse) {
        await route.fulfill({ response: lastResponse });
      } else {
        await route.continue();
      }
    }
  );
}
