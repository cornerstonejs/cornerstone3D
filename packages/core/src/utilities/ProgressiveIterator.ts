export class PromiseIterator<T> extends Promise<T> {
  iterator?: ProgressiveIterator<T>;
}

export type ErrorCallback = (message: string | Error) => void;

/**
 * A progressive iterator is an async iterator that can have data delivered
 * to it, with newer ones replacing older iterations which have not yet been
 * consume.  That allows iterating over sets of values and delivering updates,
 * but always getting the most recent instance.
 */
export default class ProgressiveIterator<T> {
  public done;
  public name?: string;

  private nextValue;
  private waiting;
  private rejectReason;

  constructor(name?) {
    this.name = name || 'unknown';
  }

  /** Casts a promise, progressive iterator or promise iterator to a
   * progressive iterator, creating one if needed to resolve it.
   */
  public static as(promise) {
    if (promise.iterator) {
      return promise.iterator;
    }
    const iterator = new ProgressiveIterator('as iterator');
    promise.then(
      (v) => {
        try {
          iterator.add(v, true);
        } catch (e) {
          iterator.reject(e as Error);
        }
      },
      (reason) => iterator.reject(reason)
    );
    return iterator;
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

  public resolve() {
    this.done = true;
    if (this.waiting) {
      this.waiting.resolve(this.nextValue);
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

  /**
   * Async iteration where the delivered values are the most recently available
   * ones, so not necessarily all values are ever seen.
   */
  public async *[Symbol.asyncIterator]() {
    while (!this.done) {
      if (this.rejectReason) {
        throw this.rejectReason;
      }
      if (this.nextValue !== undefined) {
        // console.log('Yielding on', this.name, this.nextValue);
        yield this.nextValue;
        if (this.done) {
          break;
        }
      }
      if (!this.waiting) {
        this.waiting = {};
        this.waiting.promise = new Promise((resolve, reject) => {
          this.waiting.resolve = resolve;
          this.waiting.reject = reject;
        });
      }
      // console.log('Awaiting on', this.name);
      await this.waiting.promise;
    }
    // console.log('Final yield on', this.name);
    yield this.nextValue;
  }

  /** Runs the forEach method on this filter */
  public async forEach(callback, errorCallback) {
    let index = 0;
    // Need to catch basic iteration errors first
    try {
      for await (const value of this) {
        const { done } = this;
        // Separately catch errors in the callback function
        try {
          await callback(value, done, index);
          index++;
        } catch (e) {
          if (!done) {
            console.warn('Caught exception in intermediate value', e);
            continue;
          }
          if (errorCallback) {
            errorCallback(e, done);
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      if (errorCallback) {
        errorCallback(e, true);
      } else {
        throw e;
      }
    }
  }

  /** Calls an async function to generate the results on the iterator */
  public generate(
    processFunction,
    errorCallback?: ErrorCallback
  ): Promise<any> {
    return processFunction(this, this.reject.bind(this)).then(
      () => {
        if (!this.done) {
          // Set it to done
          this.resolve();
        }
      },
      (reason) => {
        this.reject(reason);
        if (errorCallback) {
          errorCallback(reason);
        } else {
          console.warn("Couldn't process because", reason);
        }
      }
    );
  }

  async nextPromise(): Promise<T> {
    for await (const i of this) {
      if (i) {
        return i;
      }
    }
    return this.nextValue;
  }

  async donePromise(): Promise<T> {
    for await (const i of this) {
      // No-op
    }
    return this.nextValue;
  }

  public getNextPromise() {
    const promise = this.nextPromise() as PromiseIterator<T>;
    promise.iterator = this;
    return promise;
  }

  public getDonePromise() {
    const promise = this.donePromise() as PromiseIterator<T>;
    promise.iterator = this;
    return promise;
  }
}
