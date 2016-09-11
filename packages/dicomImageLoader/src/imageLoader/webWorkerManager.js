(function ($, cornerstoneWADOImageLoader) {

  "use strict";

  // the taskId to assign to the next task added via addTask()
  var nextTaskId = 0;

  // array of queued tasks sorted with highest priority task first
  var tasks = [];

  // array of web workers to dispatch decode tasks to
  var webWorkers = [];

  var defaultConfig = {
    maxWebWorkers: navigator.hardwareConcurrency || 1,
    startWebWorkersOnDemand: true,
    webWorkerPath : '../../dist/cornerstoneWADOImageLoaderWebWorker.js',
    webWorkerTaskPaths: [],
    taskConfiguration: {
      'decodeTask' : {
        loadCodecsOnStartup : true,
        initializeCodecsOnStartup: false,
        codecsPath: '../dist/cornerstoneWADOImageLoaderCodecs.js',
        usePDFJS: false
      }
    }
  };

  var config;

  var statistics = {
    maxWebWorkers : 0,
    numWebWorkers : 0,
    numTasksQueued : 0,
    numTasksExecuting : 0,
    numTasksCompleted: 0,
    totalTaskTimeInMS: 0,
    totalTimeDelayedInMS: 0
  };

  /**
   * Function to start a task on a web worker
   */
  function startTaskOnWebWorker() {
    // return immediately if no decode tasks to do
    if(!tasks.length) {
      return;
    }

    // look for a web worker that is ready
    for(var i=0; i < webWorkers.length; i++) {
       {
        if(webWorkers[i].status === 'ready') {
          // mark it as busy so tasks are not assigned to it
          webWorkers[i].status = 'busy';

          // get the highest priority task
          var task = tasks.shift();
          task.start = new Date().getTime();

          // update stats with how long this task was delayed (waiting in queue)
          var end = new Date().getTime();
          statistics.totalTimeDelayedInMS += end - task.added;

          // assign this task to this web worker and send the web worker
          // a message to execute it
          webWorkers[i].task = task;
          webWorkers[i].worker.postMessage({
            taskType: task.taskType,
            workerIndex: i,
            data: task.data
          }, task.transferList);
          statistics.numTasksExecuting++;
          return;
        }
      }
    }

    // if no available web workers and we haven't started max web workers, start a new one
    if(webWorkers.length < config.maxWebWorkers) {
      spawnWebWorker();
    }
  }

  /**
   * Function to handle a message from a web worker
   * @param msg
   */
  function handleMessageFromWorker(msg) {
    //console.log('handleMessageFromWorker', msg.data);
    if(msg.data.taskType === 'initialize') {
      webWorkers[msg.data.workerIndex].status = 'ready';
      startTaskOnWebWorker();
    } else {
      statistics.numTasksExecuting--;
      webWorkers[msg.data.workerIndex].status = 'ready';
      statistics.numTasksCompleted++;
      var end = new Date().getTime();
      statistics.totalTaskTimeInMS += end - webWorkers[msg.data.workerIndex].task.start;
      webWorkers[msg.data.workerIndex].task.deferred.resolve(msg.data.result);
      webWorkers[msg.data.workerIndex].task = undefined;
      startTaskOnWebWorker();
    }
  }

  /**
   * Spawns a new web worker
   */
  function spawnWebWorker() {
    // prevent exceeding maxWebWorkers
    if(webWorkers.length >= config.maxWebWorkers) {
      return;
    }

    // spawn the webworker
    var worker = new Worker(config.webWorkerPath);
    webWorkers.push({
      worker: worker,
      status: 'initializing'
    });
    worker.addEventListener('message', handleMessageFromWorker);
    worker.postMessage({
      taskType: 'initialize',
      workerIndex: webWorkers.length - 1,
      config: config
    });
  }

  /**
   * Initialization function for the web worker manager - spawns web workers
   * @param configObject
   */
  function initialize(configObject) {
    configObject = configObject || defaultConfig;

    // prevent being initialized more than once
    if(config) {
      throw new Error('WebWorkerManager already initialized');
    }

    config = configObject;

    config.maxWebWorkers = config.maxWebWorkers || (navigator.hardwareConcurrency || 1);

    // Spawn new web workers
    if(!config.startWebWorkersOnDemand) {
      for(var i=0; i < config.maxWebWorkers; i++) {
        spawnWebWorker();
      }
    }
  }

  /**
   * dynamically loads a web worker task
   * @param sourcePath
   * @param taskConfig
   */
  function loadWebWorkerTask(sourcePath, taskConfig) {
    // add it to the list of web worker tasks paths so on demand web workers
    // load this properly
    config.webWorkerTaskPaths.push(sourcePath);

    // if a task specific configuration is provided, merge it into the config
    if(taskConfig) {
      config.taskConfiguration = Object.assign(config.taskConfiguration, taskConfig);
    }

    // tell each spawned web worker to load this task
    for(var i=0; i < webWorkers.length; i++) {
      webWorkers[i].worker.postMessage({
        taskType: 'loadWebWorkerTask',
        workerIndex: webWorkers.length - 1,
        sourcePath: sourcePath,
        config: config
      });
    }
  }

  /**
   * Function to add a decode task to be performed
   *
   * @param taskType - the taskType for this task
   * @param data - data specific to the task
   * @param priority - optional priority of the task (defaults to 0), > 0 is higher, < 0 is lower
   * @param transferList - optional array of data to transfer to web worker
   * @returns {*}
   */
  function addTask(taskType, data, priority, transferList) {
    if (!config) {
      initialize();
    }

    priority = priority || 0;
    var deferred = $.Deferred();

    // find the right spot to insert this decode task (based on priority)
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].priority <= priority) {
        break;
      }
    }

    var taskId = nextTaskId++;

    // insert the decode task at position i
    tasks.splice(i, 0, {
      taskId: taskId,
      taskType: taskType,
      status: 'ready',
      added: new Date().getTime(),
      data: data,
      deferred: deferred,
      priority: priority,
      transferList: transferList
    });

    // try to start a task on the web worker since we just added a new task and a web worker may be available
    startTaskOnWebWorker();

    return {
      taskId: taskId,
      promise: deferred.promise()
    };
  }

  /**
   * Changes the priority of a queued task
   * @param taskId - the taskId to change the priority of
   * @param priority - priority of the task (defaults to 0), > 0 is higher, < 0 is lower
   * @returns boolean - true on success, false if taskId not found
   */
  function setTaskPriority(taskId, priority) {
    // search for this taskId
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].taskId === taskId) {
        // taskId found, remove it
        var task = tasks.splice(i, 1)[0];

        // set its prioirty
        task.priority = priority;

        // find the right spot to insert this decode task (based on priority)
        for (i = 0; i < tasks.length; i++) {
          if (tasks[i].priority <= priority) {
            break;
          }
        }

        // insert the decode task at position i
        tasks.splice(i, 0, task);
        return true;
      }
    }
    return false;
  }

  /**
   * Cancels a queued task and rejects
   * @param taskId - the taskId to cancel
   * @param reason - optional reason the task was rejected
   * @returns boolean - true on success, false if taskId not found
   */
  function cancelTask(taskId, reason) {
    // search for this taskId
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].taskId === taskId) {
        // taskId found, remove it
        var task = tasks.splice(i, 1);
        task.promise.reject(reason);
        return true;
      }
    }
    return false;
  }

  /**
   * Function to return the statistics on running web workers
   * @returns object containing statistics
   */
  function getStatistics() {
    statistics.maxWebWorkers = config.maxWebWorkers;
    statistics.numWebWorkers = webWorkers.length;
    statistics.numTasksQueued = tasks.length;
    return statistics;
  }

  // module exports
  cornerstoneWADOImageLoader.webWorkerManager = {
    initialize : initialize,
    loadWebWorkerTask: loadWebWorkerTask,
    addTask : addTask,
    getStatistics: getStatistics,
    setTaskPriority: setTaskPriority,
    cancelTask: cancelTask
  };

}($, cornerstoneWADOImageLoader));