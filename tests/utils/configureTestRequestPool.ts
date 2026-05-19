import type { Page } from '@playwright/test';

/**
 * Combined cap across metadata, interaction, thumbnail, and prefetch request types.
 * Default production value is 10; tests use a higher limit to reduce CI flakes when
 * many examples load volumes in parallel.
 */
export const DEFAULT_TEST_MAX_CONCURRENT_REQUESTS = 100;

/**
 * Raises the combined request pool size for image load and retrieval managers.
 * Call after an example page has initialized Cornerstone (e.g. from visitExample).
 */
export const configureTestRequestPool = async (
  page: Page,
  maxConcurrentRequests = DEFAULT_TEST_MAX_CONCURRENT_REQUESTS
) => {
  await page.waitForFunction(
    () =>
      Boolean(
        (window as { cornerstone?: { imageLoadPoolManager?: unknown } })
          .cornerstone?.imageLoadPoolManager
      )
  );

  await page.evaluate((max) => {
    const cornerstone = (
      window as {
        cornerstone?: {
          imageLoadPoolManager?: {
            setMaxConcurrentRequests: (n: number) => void;
          };
          imageRetrievalPoolManager?: {
            setMaxConcurrentRequests: (n: number) => void;
          };
        };
      }
    ).cornerstone;

    cornerstone?.imageLoadPoolManager?.setMaxConcurrentRequests(max);
    cornerstone?.imageRetrievalPoolManager?.setMaxConcurrentRequests(max);
  }, maxConcurrentRequests);
};
