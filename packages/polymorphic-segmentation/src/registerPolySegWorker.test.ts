const mockRegisterWorker = jest.fn();

jest.mock('@cornerstonejs/core', () => ({
  getWebWorkerManager: () => ({ registerWorker: mockRegisterWorker }),
  utilities: {
    deepMerge: jest.requireActual('../../core/src/utilities/deepMerge').default,
  },
}));

/** The options that one registration of the polySeg worker gives. */
function registeredOptions(userOptions?) {
  let options;

  jest.isolateModules(() => {
    const { registerPolySegWorker } = require('./registerPolySegWorker');

    mockRegisterWorker.mockClear();
    registerPolySegWorker(userOptions);
    options = mockRegisterWorker.mock.calls[0][2];
  });

  return options;
}

describe('registerPolySegWorker', () => {
  it('registers one instance of the worker by default', () => {
    expect(registeredOptions().maxWorkerInstances).toBe(1);
  });

  it('registers one instance whatever the number of logical processors', () => {
    const { hardwareConcurrency } = globalThis.navigator;

    Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 16,
    });

    try {
      expect(registeredOptions().maxWorkerInstances).toBe(1);
    } finally {
      Object.defineProperty(globalThis.navigator, 'hardwareConcurrency', {
        configurable: true,
        value: hardwareConcurrency,
      });
    }
  });

  it('registers the number of instances that init asks for', () => {
    expect(registeredOptions({ maxWorkerInstances: 4 })).toMatchObject({
      maxWorkerInstances: 4,
      autoTerminateOnIdle: { enabled: true, idleTimeThreshold: 2000 },
    });
  });
});
