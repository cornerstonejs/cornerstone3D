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

/**
 * Registers a worker of three instances whose factory counts the instances
 * that it makes.
 */
function registerCountingWorker(manager, created, options = {}) {
  manager.registerWorker('three', () => createWorker(created), {
    maxWorkerInstances: 3,
    ...options,
  });
}

/** The index of the instance that a stand-in worker is, in creation order. */
function instanceIndexOf(manager, worker) {
  return manager.workerRegistry.three.nativeWorkers.indexOf(worker);
}

describe('The web worker manager makes and chooses instances', () => {
  it('makes no instance at registration and one for each task that runs at the same time', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    registerCountingWorker(manager, created);

    expect(created.length).toBe(0);

    await manager.executeTask('three', 'run', { delay: 5 });
    expect(created.length).toBe(1);

    await manager.executeTask('three', 'run', { delay: 5 });
    expect(created.length).toBe(1);

    await Promise.all([
      manager.executeTask('three', 'run', { delay: 20 }),
      manager.executeTask('three', 'run', { delay: 20 }),
    ]);
    expect(created.length).toBe(2);

    await Promise.all([
      manager.executeTask('three', 'run', { delay: 20 }),
      manager.executeTask('three', 'run', { delay: 20 }),
      manager.executeTask('three', 'run', { delay: 20 }),
    ]);
    expect(created.length).toBe(3);
    expect(manager.workerRegistry.three.instances.length).toBe(3);
  });

  it('reads the load of each instance by its own index after an instance before it was terminated', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    registerCountingWorker(manager, created);

    await Promise.all([
      manager.executeTask('three', 'run', { delay: 5 }),
      manager.executeTask('three', 'run', { delay: 5 }),
      manager.executeTask('three', 'run', { delay: 5 }),
    ]);
    expect(created.length).toBe(3);

    const [first, second, third] = created;

    manager.terminateWorkerInstance('three', instanceIndexOf(manager, first));

    const long = manager.executeTask('three', 'run', { delay: 200 });

    await sleep(10);

    const busyIndex = manager.workerRegistry.three.loadCounters.findIndex(
      (load) => load > 0
    );

    expect(manager.workerRegistry.three.nativeWorkers[busyIndex]).not.toBe(
      first
    );

    const next = manager.getNextWorkerAPI('three');

    expect(created.length).toBe(3);
    expect(next.index).not.toBe(busyIndex);
    expect([second, third]).toContain(
      manager.workerRegistry.three.nativeWorkers[next.index]
    );
    manager.workerRegistry.three.loadCounters[next.index]--;
    await long;
  });

  it('gives a task to an idle instance that exists before it makes another one', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    registerCountingWorker(manager, created);

    await Promise.all([
      manager.executeTask('three', 'run', { delay: 5 }),
      manager.executeTask('three', 'run', { delay: 5 }),
    ]);
    expect(created.length).toBe(2);

    manager.terminateWorkerInstance('three', 0);

    const next = manager.getNextWorkerAPI('three');

    expect(created.length).toBe(2);
    expect(next.index).toBe(1);
    expect(next.api).toBe(created[1].api);
    manager.workerRegistry.three.loadCounters[next.index]--;
  });

  it('gives a task to an idle instance and not to the first one while that one runs a task', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    registerCountingWorker(manager, created);

    await Promise.all([
      manager.executeTask('three', 'run', { delay: 5 }),
      manager.executeTask('three', 'run', { delay: 5 }),
    ]);

    const long = manager.executeTask('three', 'run', { delay: 200 });

    await sleep(10);
    expect(manager.workerRegistry.three.loadCounters[0]).toBe(1);

    const short = manager.executeTask('three', 'run', { delay: 5 });

    await sleep(1);
    expect(manager.workerRegistry.three.loadCounters).toEqual([1, 1, 0]);
    await expect(short).resolves.toBe(5);
    expect(created.length).toBe(2);
    await long;
  });

  it('terminates an idle instance and makes it again for the next task', async () => {
    const manager = new CentralizedWorkerManager();
    const created = [];

    registerCountingWorker(manager, created, {
      maxWorkerInstances: 1,
      autoTerminateOnIdle: { enabled: true, idleTimeThreshold: 20 },
    });

    await expect(
      manager.executeTask('three', 'run', { delay: 5 })
    ).resolves.toBe(5);
    expect(created.length).toBe(1);

    await sleep(80);
    expect(created[0].terminated).toBe(true);
    expect(manager.workerRegistry.three.instances).toEqual([null]);

    await expect(
      manager.executeTask('three', 'run', { delay: 5 })
    ).resolves.toBe(5);
    expect(created.length).toBe(2);
    expect(created[1].terminated).toBe(false);
    clearInterval(manager.workerRegistry.three.idleCheckIntervalId);
  });
});
