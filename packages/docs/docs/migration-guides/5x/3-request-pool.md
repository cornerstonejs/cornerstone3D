# Combined Request Pool Limit

In 5.x the `RequestPoolManager` gains a **combined concurrency cap** that is
shared across all HTTP request types (metadata, interaction, thumbnail, and
prefetch), in addition to the existing per-type maximums.

## What Changed

Previously each request type had its own independent maximum
(`setMaxSimultaneousRequests(type, n)`) and there was no ceiling on the total
number of in-flight requests. On the shared `imageLoadPoolManager` this meant
interaction, thumbnail, and prefetch were each allowed up to 1000 concurrent
requests, so a large prefetch backlog could saturate the browser's connection
pool and delay interaction fetches.

5.x adds:

- A new **combined cap**, `maxConcurrentRequests`, that bounds the _total_
  number of concurrent metadata + interaction + thumbnail + prefetch requests.
  It defaults to **50** and can be set with
  `poolManager.setMaxConcurrentRequests(n)`.
- A new highest-priority request type, `RequestType.Metadata`, intended for
  metadata fetches that must complete before images can render.
- A **starvation guarantee**: even when the combined pool is full, at least one
  `Interaction` request is always allowed through, and one `Thumbnail` request
  is allowed when nothing else is outstanding. This ensures background prefetch
  work can never fully block interaction.

The per-type maximums still apply — the effective number of requests dispatched
for a type is the smaller of its per-type maximum and the remaining combined
budget.

The `Compute` queue is unaffected: compute requests do not use HTTP and run on a
separate queue that the combined pool does not throttle.

## Why This Matters

If your application relied on the previous behavior of effectively unbounded
concurrent image requests, the shared `imageLoadPoolManager` is now capped at
**50** combined concurrent requests by default. For most applications this is a
safer default that prevents low-priority fetches from starving interaction, but
if you deliberately depended on very high concurrency you should raise the cap
explicitly.

## Migration Guidance

- **No change required** for most applications; the new default cap of 50 is a
  reasonable ceiling and the interaction guarantee preserves responsiveness.
- To tune the combined ceiling for a specific pool, call
  `setMaxConcurrentRequests`:

  ```js
  import { imageLoadPoolManager } from '@cornerstonejs/core';

  // Raise (or lower) the total concurrent HTTP requests for the image-load pool.
  imageLoadPoolManager.setMaxConcurrentRequests(100);
  ```

- The per-type API is unchanged; keep using
  `setMaxSimultaneousRequests(type, n)` to cap an individual type. The combined
  cap is applied on top of the per-type maximums.
- If you fetch metadata through the pool and want it prioritized ahead of image
  loading, enqueue those requests with `RequestType.Metadata`.
