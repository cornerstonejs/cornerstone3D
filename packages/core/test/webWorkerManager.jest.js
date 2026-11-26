import CentralizedWorkerManager from '../src/webWorkerManager/webWorkerManager';

jest.mock('comlink', () => ({
  wrap: (worker) => worker.api,
  proxy: (callback) => callback,
  releaseProxy: 'releaseProxy',
}));

/**
 * A stand-in worker whose `run` method answers after `delay` ms, and which
 * says whether it was terminated.
 */
function createWorker(created) {
  const worker = {
    terminated: false,
    terminate: jest.fn(() => {
      worker.terminated = true;
    }),
    api: {
      releaseProxy: jest.fn(),
      run: ({ delay }) =>
        new Promise((resolve) => setTimeout(() => resolve(delay), delay)),
    },
  };

  created.push(worker);

  return worker;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('The web worker manager with several instances of a worker', () => {
  it('does not terminate an instance on idle while its first task runs', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    manager.registerWorker('pair', () => createWorker(created), {
      maxWorkerInstances: 2,
      autoTerminateOnIdle: { enabled: true, idleTimeThreshold: 20 },
    });

    const short = manager.executeTask('pair', 'run', { delay: 10 });
    const long = manager.executeTask('pair', 'run', { delay: 200 });

    await short;
    await sleep(100);

    expect(created[1].terminated).toBe(false);
    await expect(long).resolves.toBe(200);

    await sleep(100);
    expect(created.every((worker) => worker.terminated)).toBe(true);
    clearInterval(manager.workerRegistry.pair.idleCheckIntervalId);
  });

  it('does not terminate an instance on idle while it runs a task, when another instance finished one', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    manager.registerWorker('pair', () => createWorker(created), {
      maxWorkerInstances: 2,
      autoTerminateOnIdle: { enabled: true, idleTimeThreshold: 20 },
    });

    await Promise.all([
      manager.executeTask('pair', 'run', { delay: 5 }),
      manager.executeTask('pair', 'run', { delay: 5 }),
    ]);

    const long = manager.executeTask('pair', 'run', { delay: 200 });
    const short = manager.executeTask('pair', 'run', { delay: 10 });

    await short;
    await sleep(100);

    expect(created[0].terminated).toBe(false);
    await expect(long).resolves.toBe(200);
    clearInterval(manager.workerRegistry.pair.idleCheckIntervalId);
  });
});
