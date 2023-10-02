/**
 * A progressive iterator is an async iterator that can have data delivered
 * to it, with newer ones replacing older iterations which have not yet been
 * consume.  That allows iterating over sets of values and delivering updates,
 * but always getting the most recent instance.
 */
export default class C {
  private nextValue;
  private done;
  private waiting;
  private resolve;

  add(x, done) {
    this.nextValue = x;
    this.done ||= done;
    if (this.waiting) {
      this.resolve(x);
      this.resolve = undefined;
      this.reject = undefined;
      this.waiting = undefined;
    }
  }

  async *[Symbol.asyncIterator]() {
    while (!this.done) {
      if (this.nextValue !== undefined) {
        const value = this.nextValue;
        this.nextValue = undefined;
        yield value;
        continue;
      }
      if (!this.waiting) {
        this.waiting = new Promise((resolve) => {
          this.resolve = resolve;
        });
      }
      await this.waiting;
    }
    yield this.nextValue;
  }
}
