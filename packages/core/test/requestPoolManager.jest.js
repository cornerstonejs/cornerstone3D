import { RequestPoolManager } from '../src/requestPool/requestPoolManager';
import RequestType from '../src/enums/RequestType';

/**
 * Builds a request function that returns a promise which never settles, so the
 * pool keeps counting it as "in flight". Each call is recorded on `requestFn`
 * (a jest.fn) so tests can assert exactly how many requests were dispatched.
 */
function pendingRequest() {
  return jest.fn(() => new Promise(() => {}));
}

/**
 * Adds `count` requests of a given type, each backed by its own pending
 * requestFn, and returns the array of jest.fns so the caller can count how
 * many were actually invoked (i.e. dispatched) by the pool.
 */
function addPending(manager, type, count, priority = 0) {
  const fns = [];
  for (let i = 0; i < count; i++) {
    const fn = pendingRequest();
    fns.push(fn);
    manager.addRequest(fn, type, {}, priority);
  }
  return fns;
}

function dispatchedCount(fns) {
  return fns.filter((fn) => fn.mock.calls.length > 0).length;
}

describe('RequestPoolManager', () => {
  describe('default configuration', () => {
    it('includes the Metadata type in the per-type maximums', () => {
      const manager = new RequestPoolManager();

      // Metadata was added alongside the combined pool; it defaults to the same
      // per-type ceiling as interaction/thumbnail.
      expect(manager.getMaxSimultaneousRequests(RequestType.Metadata)).toBe(6);
      expect(manager.getMaxSimultaneousRequests(RequestType.Interaction)).toBe(
        6
      );
      expect(manager.getMaxSimultaneousRequests(RequestType.Thumbnail)).toBe(6);
      expect(manager.getMaxSimultaneousRequests(RequestType.Prefetch)).toBe(5);
      expect(manager.getMaxSimultaneousRequests(RequestType.Compute)).toBe(
        1000
      );
    });

    it('starts with no outstanding requests', () => {
      const manager = new RequestPoolManager();
      expect(manager.outstandingRequests).toBe(0);
    });
  });

  describe('combined pool limit', () => {
    it('caps the total in-flight requests across types at maxConcurrentRequests', () => {
      const manager = new RequestPoolManager();
      manager.setMaxConcurrentRequests(3);

      // Prefetch alone would allow 5 concurrent (its per-type max), but the
      // combined pool of 3 must win.
      const fns = addPending(manager, RequestType.Prefetch, 10);

      expect(dispatchedCount(fns)).toBe(3);
      expect(manager.outstandingRequests).toBe(3);
    });

    it('is bounded by the per-type maximum when it is lower than the combined pool', () => {
      const manager = new RequestPoolManager();
      manager.setMaxConcurrentRequests(20);

      // Combined pool allows 20, but prefetch is capped at 5 per type.
      const fns = addPending(manager, RequestType.Prefetch, 10);

      expect(dispatchedCount(fns)).toBe(5);
      expect(manager.outstandingRequests).toBe(5);
    });
  });

  describe('interaction is never starved by lower-priority fetches', () => {
    it('still dispatches one interaction request when the combined pool is full', () => {
      const manager = new RequestPoolManager();
      manager.setMaxConcurrentRequests(2);

      // Saturate the combined pool with prefetch (lower priority) work.
      const prefetchFns = addPending(manager, RequestType.Prefetch, 5);
      expect(dispatchedCount(prefetchFns)).toBe(2);
      expect(manager.outstandingRequests).toBe(2);

      // An interaction arriving after the pool is full must still get through -
      // this is the guarantee that background fetches cannot block interaction.
      const interactionFns = addPending(manager, RequestType.Interaction, 3);

      expect(dispatchedCount(interactionFns)).toBe(1);
    });

    it('only forces through a single interaction, not the whole backlog', () => {
      const manager = new RequestPoolManager();
      manager.setMaxConcurrentRequests(2);

      addPending(manager, RequestType.Prefetch, 5);
      const interactionFns = addPending(manager, RequestType.Interaction, 4);

      // With one interaction already in flight and the pool over capacity, the
      // remaining interaction requests wait their turn.
      expect(dispatchedCount(interactionFns)).toBe(1);
    });
  });

  describe('outstandingRequests', () => {
    it('counts interaction, thumbnail and prefetch but excludes metadata', () => {
      const manager = new RequestPoolManager();

      // A metadata request is in flight...
      const metadataFns = addPending(manager, RequestType.Metadata, 1);
      expect(dispatchedCount(metadataFns)).toBe(1);
      // ...but it does not count toward outstandingRequests.
      expect(manager.outstandingRequests).toBe(0);

      // A prefetch request does count.
      const prefetchFns = addPending(manager, RequestType.Prefetch, 1);
      expect(dispatchedCount(prefetchFns)).toBe(1);
      expect(manager.outstandingRequests).toBe(1);
    });
  });

  describe('compute queue', () => {
    it('runs on a separate queue that ignores the combined pool limit', () => {
      const manager = new RequestPoolManager();
      manager.setMaxConcurrentRequests(1);

      // Compute requests do not use HTTP requests, so they are dispatched off a
      // separate queue that the combined pool size does not throttle.
      const fns = addPending(manager, RequestType.Compute, 5);

      expect(dispatchedCount(fns)).toBe(5);
      // And they are not reflected in outstandingRequests.
      expect(manager.outstandingRequests).toBe(0);
    });
  });
});
