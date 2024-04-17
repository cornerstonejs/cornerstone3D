import ProgressiveIterator from '../src/utilities/ProgressiveIterator';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliver(iterator, values) {
  for (let i = 0; i < values.length; i++) {
    const { ms = 200, value = i } = values[i];
    await sleep(ms);
    iterator.add(value, i === values.length - 1);
  }
}

async function retrieve(it) {
  const results = [];
  for await (const i of it) {
    results.push(i);
    await sleep(100);
  }
  return results;
}

describe('ProgressiveIterator', () => {
  it('Delivers final value', function (done) {
    const iterator = new ProgressiveIterator();
    deliver(iterator, [{}, {}, {}]);
    retrieve(iterator).then((items) => {
      expect(items).toEqual([0, 1, 2]);
      done();
    });
  });

  it('Skips intermediates', function (done) {
    const iterator = new ProgressiveIterator();
    deliver(iterator, [
      { value: 8, ms: 10 },
      // The next two should be delivered together because the
      // wait time total is only 60 ms, while the retrieve time is 100 ms
      { value: 12, ms: 50 },
      { value: 20, ms: 10 },
    ]);
    retrieve(iterator).then((items) => {
      expect(items).toEqual([8, 20]);
      done();
    });
  });
});
