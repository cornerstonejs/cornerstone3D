import { expose } from 'comlink';

/**
 * This object simulates a heavy task by implementing a sleep function and a recursive Fibonacci function.
 * It's used for testing or demonstrating purposes where a heavy or time-consuming task is needed.
 */
const obj = {
  counter: 69,

  /**
   * This function simulates a delay or sleep.
   */
  sleep({ time }) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, time);
    });
  },

  /**
   * This function calculates the Fibonacci number at the specified index.
   * This is a heavy operation for large values and is used to simulate a heavy task.
   */
  fib({ value }) {
    if (value <= 1) {
      return 1;
    }
    return obj.fib({ value: value - 1 }) + obj.fib({ value: value - 2 });
  },
};

expose(obj);
