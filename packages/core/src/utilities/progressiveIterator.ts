export class PromiseIterator<T> extends Promise<T> {
  iterator?: ProgressiveIterator<T>;
}

/**
 * A progressive iterator is an async iterator that can have data delivered
 * to it, with newer ones replacing older iterations which have not yet been
 * consume.  That allows iterating over sets of values and delivering updates,
 * but always getting the most recent instance.
 */
export default class ProgressiveIterator<T> {
  private nextValue;
  private done;
  private waiting;
  private rejectReason;

  constructor(processFunction?) {
    if (processFunction) {
      this.process(processFunction);
    }
  }

  /** Casts a promise, progressive iterator or promise iterator to a
   * progressive iterator, creating one if needed to resolve it.
   */
  public static as(promise) {
    if (promise.iterator) {
      return promise.iterator;
    }
    return new ProgressiveIterator((resolver, reject) => {
      promise.then((v) => resolver.add(v, true), reject);
    });
  }

  /** Add a most recent result, indicating if the result is the final one */
  public add(x: T, done = false) {
    this.nextValue = x;
    this.done ||= done;
    if (this.waiting) {
      this.waiting.resolve(x);
      this.waiting = undefined;
    }
  }

  /** Reject the fetch.  This will prevent further iteration. */
  public reject(reason: Error): void {
    this.rejectReason = reason;
    this.waiting?.reject(reason);
  }

  /** Gets the most recent value, without waiting */
  public getRecent(): T {
    if (this.rejectReason) {
      throw this.rejectReason;
    }
    return this.nextValue;
  }

  public async *[Symbol.asyncIterator]() {
    while (!this.done) {
      if (this.rejectReason) {
        throw this.rejectReason;
      }
      if (this.nextValue !== undefined) {
        yield this.nextValue;
      }
      if (!this.waiting) {
        this.waiting = {};
        this.waiting.promise = new Promise((resolve, reject) => {
          this.waiting.resolve = resolve;
          this.waiting.reject = reject;
        });
      }
      await this.waiting.promise;
    }
    yield this.nextValue;
  }

  public process(processFunction) {
    return processFunction(this, this.reject.bind(this)).then(
      () => {
        if (!this.done) {
          // Set it to done
          this.add(this.nextValue, true);
        }
      },
      (reason) => {
        console.warn("Couldn't process because", reason);
      }
    );
  }

  async nextPromise(): PromiseIterator<T> {
    for await (const i of this) {
      if (i) {
        return i;
      }
    }
    throw new Error('Nothing found');
  }

  async donePromise(): PromiseIterator<T> {
    for await (const i of this) {
      if (i) {
        return i;
      }
    }
    throw new Error('Nothing found');
  }

  public getNextPromise(): PromiseIterator<T> {
    const promise = this.nextPromise();
    promise.iterator = this;
    return promise;
  }

  public getDonePromise(): PromiseIterator<T> {
    const promise = this.donePromise();
    promise.iterator = this;
    return promise;
  }
}
