import { expose } from 'comlink';

const obj = {
  counter: 69,
  sleep({ time }) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, time);
    });
  },
  fib({ value }) {
    if (value <= 1) {
      return 1;
    }
    return obj.fib({ value: value - 1 }) + obj.fib({ value: value - 2 });
  },
};

expose(obj);
