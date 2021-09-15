# Web Workers

## Introduction

Medical Imaging applications often involve CPU intensive computation for tasks
such as image decompression and image processing. CornerstoneWADOImageLoader
includes a framework for executing such tasks in a pool of web workers thus
allowing your application to take advantage of all CPU cores and avoid locking
up the UI thread. This web worker framework is used for image decompression but
is designed to be usable for custom tasks as well. By using the cornerstone web
worker framework for your CPU intensive tasks, you can better control the
utilization of the available CPU cores.

## Features

- Allows applications to control how many web workers are spawned
- Includes a task for decoding DICOM Images
- Allows applications to add custom web worker tasks
- Allows applications to assign a priority to web worker tasks
- Allows applications to pass in web worker task specific configuration options

## Examples

See the
[Custom Web Worker Task Example](../examples/customWebWorkerTask/index.html) to
see the above features in action.

## Configuration

The web worker framework requires a bit of configuration since web workers
require paths to source files. Since cornerstone does not enforce a convention
for source file location, you must tell the cornerstone web worker framework
where the web worker files are so it can load them properly. This is done via
the cornerstoneWADOImageLoader.webWorkerManager.initialize() function. You must
call this function before using starting a web worker task (or loading an image
with cornerstone) so the web worker code is properly loaded.

## Minimal Configuration

Here is an example of a minimal configuration object.

```javascript
var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
```

## Advanced Configuration

Building on the prior minimal example, you can configure the web worker
framework in several ways.

```javascript
var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
  webWorkerTaskPaths: [
    '../examples/customWebWorkerTask/sleepTask.js',
    '../examples/customWebWorkerTask/sharpenTask.js',
  ],
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
    },
    sleepTask: {
      sleepTime: 3000,
    },
  },
};
cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
```

- maxWebWorkers - controls how many web workers to create. Some browsers will
  return the number of cores available via the navigator.hardwareConcurrency.
  For those browsers that don't support this property, the default number of web
  workers is set to 1. The web worker framework will automatically use this
  property or set to 1 web worker if not available. You can override the number
  of web workers by setting this property yourself. You may want to do this to
  add support for additional web workers on browsers that don't support
  navigator.hardwareConcurrency or if you find that using all cores slows down
  the main ui thread too much.

- startWebWorkersOnDemand - true if you want to create web workers only when
  needed, false if you want them all created on initialize (default).

- webWorkerTaskPaths - This is an array of paths to custom web worker tasks. See
  section "Custom Web Worker Tasks" below for more information.

- taskConfiguration.decodeTask.initializeCodecsOnStartup - By default, the web
  worker framework does not initialize the JPEG2000 or JPEG-LS decoders on
  startup. Initialization takes even more CPU (and time) than loading so it is
  disabled by default. If you expect to display JPEG-LS or JPEG2000 images
  frequently, you might want to enable this flag.

- taskConfiguration.sleepTask.sleepTime - This is a configuration option for a
  custom web worker task, See "Custom Web Worker Tasks" section below.

## Custom Web Worker Tasks

If you want to create your own custom web worker tasks, follow the following
steps:

1. Create a new source file for your custom web worker task (e.g. sleepTask.js)

2. Add the path to that source file in the webWorkerTaskPaths array

3. Register your custom web worker task with the framework by calling
   self.registerTaskHandler() function. This function accepts an object with
   three properties:

   - taskType - A unique string used to dispatch task requests to your custom
     web worker task
   - handler - function that is called when work is dispatched to your custom
     web worker task
   - initialize - function that is called when the web worker is first
     initialized and passed in the taskConfiguration object passed to the web
     worker framework when initialize() is called

4. Implement your handler function. The handler function will receive two
   parameters - the first being the data for the task and the second being a
   callback function.

5. Invoke the callback function with the result. The first parameter is an
   object that will be returned to the UI thread when the related promise is
   resolved. The second is an optional transferList which is an array of
   references to objects to transfer to the UI thread (via postMessage)

6. Queue a task for your custom web worker from the UI Thread using
   cornerstoneWADOImageLoader.webWorkerManager.addTask. This function takes
   three parameters:

- taskType - This should match the taskId registered by your custom web worker
  task in step 6 above
- data - This is an object you want passed to your web worker task. This can
  include pixel data or whatever else you want
- priority - integer with lower numbers being higher priority. if not specified
  a priority of 0 is used. Note that decode tasks currently use a priority of 5
  And returns an object with the following properties
- taskId - unique id for this task
- promise - a promise that is resolved when the task completes

7. Have the UI thread set a then handler on the returned promise to get the
   result the custom web worker returned in step 5 above.
