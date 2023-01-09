// an object of task handlers
const taskHandlers = {};

// Flag to ensure web worker is only initialized once
let initialized = false;

// the configuration object passed in when the web worker manager is initialized
let config;

/**
 * Initialization function that loads additional web workers and initializes them
 * @param data
 */
function initialize(data) {
  // console.log('web worker initialize ', data.workerIndex);
  // prevent initialization from happening more than once
  if (initialized) {
    return;
  }

  // save the config data
  config = data.config;

  // Additional web worker tasks can self-register by calling self.registerTaskHandler
  self.registerTaskHandler = registerTaskHandler;

  // load any additional web worker tasks
  if (data.config.webWorkerTaskPaths) {
    for (let i = 0; i < data.config.webWorkerTaskPaths.length; i++) {
      self.importScripts(data.config.webWorkerTaskPaths[i]);
    }
  }

  // initialize each task handler
  Object.keys(taskHandlers).forEach(function (key) {
    taskHandlers[key].initialize(config.taskConfiguration);
  });

  // tell main ui thread that we have completed initialization
  self.postMessage({
    taskType: 'initialize',
    status: 'success',
    result: {},
    workerIndex: data.workerIndex,
  });

  initialized = true;
}

/**
 * Function exposed to web worker tasks to register themselves
 * @param taskHandler
 */
export function registerTaskHandler(taskHandler) {
  if (taskHandlers[taskHandler.taskType]) {
    console.log(
      'attempt to register duplicate task handler "',
      taskHandler.taskType,
      '"'
    );

    return false;
  }
  taskHandlers[taskHandler.taskType] = taskHandler;
  if (initialized) {
    taskHandler.initialize(config.taskConfiguration);
  }
}

/**
 * Function to load a new web worker task with updated configuration
 * @param data
 */
function loadWebWorkerTask(data) {
  config = data.config;
  self.importScripts(data.sourcePath);
}

/**
 * Web worker message handler - dispatches messages to the registered task handlers
 * @param msg
 */
self.onmessage = async function (msg) {
  if (!msg.data.taskType) {
    console.log(msg.data);

    return;
  }

  // console.log('web worker onmessage', msg.data);

  // handle initialize message
  if (msg.data.taskType === 'initialize') {
    initialize(msg.data);

    return;
  }

  // handle loadWebWorkerTask message
  if (msg.data.taskType === 'loadWebWorkerTask') {
    loadWebWorkerTask(msg.data);

    return;
  }

  // dispatch the message if there is a handler registered for it
  if (taskHandlers[msg.data.taskType]) {
    try {
      const { result, transferList } = await taskHandlers[
        msg.data.taskType
      ].handler(msg.data);

      self.postMessage(
        {
          taskType: msg.data.taskType,
          status: 'success',
          result,
          workerIndex: msg.data.workerIndex,
        },
        transferList
      );
    } catch (error) {
      console.log(`task ${msg.data.taskType} failed - ${error.message}`, error);
      self.postMessage({
        taskType: msg.data.taskType,
        status: 'failed',
        result: error.message,
        workerIndex: msg.data.workerIndex,
      });
    }
  } else {
    // not task handler registered - send a failure message back to ui thread
    console.log('no task handler for ', msg.data.taskType);
    console.log(taskHandlers);

    self.postMessage({
      taskType: msg.data.taskType,
      status: 'failed - no task handler registered',
      workerIndex: msg.data.workerIndex,
    });
  }
};
