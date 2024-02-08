---
id: webWorker
title: Web Workers
---

WebWorkers provide a way to run scripts in background threads, allowing web applications to perform tasks without interfering with the user interface. They are particularly useful for executing computationally intensive tasks or those that require a lot of processing time.

Generally, working with workers requires a lot of boilerplate code, postMessage calls, and event listeners. Cornerstone provides a simple API to create and use workers, hiding all the complexity for you.

## Requirements

You need to install [`comlink`](https://www.npmjs.com/package/comlink) as a dependency to your application. That is all.
`comlink` is a library that allows you to use WebWorkers as if they were local objects, without having to worry about the underlying messaging.
Although it doesn't handle priority queues, load balancing or worker lifecycle, it provides a simple API to communicate with workers which is
used by Cornerstone to create a more robust and user-friendly API.

## Usage Example

It would be easier for us to explain the WebWorker API by using an example. Let's say you have a set of functions that
you want to run in the background. You need to write an object that exposes these functions via comlink.

```js
// file/location/my-awesome-worker.js

import { expose } from 'comlink';

const obj = {
  counter: 69,
  inc() {
    obj.counter++;
    console.debug('inc', obj.counter);
  },
  fib({ value }) {
    if (value <= 1) {
      return 1;
    }
    return obj.fib({ value: value - 1 }) + obj.fib({ value: value - 2 });
  },
};

expose(obj);
```

:::note
As you can see above, our object can contain any number of functions and can hold a local state. The only requirement for these functions is that the arguments SHOULD BE serializable. This means that you can't pass DOM elements, functions, or any other non-serializable objects as arguments.

We use objects for arguments. So, in the above we use `fib({value})` instead of `fib(value)` (`value` is just an argument name; you can use any name you want for the argument.)
:::

Now, the key is to inform Cornerstone about this function so that it can run smoothly in the background. Let's dive in.

## WebWorker Manager

The WebWorkerManager plays a crucial role in the WebWorker API. Its main function is to create and supervise workers.
By assigning tasks with different priorities and queue types, you can rely on the manager to effectively execute them in the background, based on the specified priority.
Furthermore, it handles the lifecycle of workers, distributes the workload, and provides a user-friendly API for executing tasks.

### `registerWorker`

Registers a new worker type with a unique name and a function to let the manager know about it.

Arguments are

- `workerName`: the name of the worker type (should be unique) and we use this later to invoke functions.
- `workerFn`: a function that returns a new Worker instance (more on this later)
- `options` an object with the following properties:
  - `maxWorkerInstances(default=1)`: the maximum number of instances of this worker type that can be created. More instance mean if there are multiple calls
    to the same function they can be offloaded to the other instances of the worker type.
  - `overwrite (default=false)`: whether to overwrite an existing worker type if already registered
  - `autoTerminateOnIdle` (default false) can be used to terminate a worker after a certain amount of idle time (in milliseconds) has passed. This is useful for workers that are not used frequently, and you want to terminate them after a specific period of time. on the manager. The argument for this method is the object of
    `{enabled: boolean, idleTimeThreshold: number(ms)}`.

:::tip
Note that if a worker is terminated it does not mean the worker is destroyed from the manager. In fact any subsequent call to the worker will create a new instance of the worker and everything would worker as expected.
:::

So to register the worker we created above, we would do the following:

```js
import { getWebWorkerManager } from '@cornerstonejs/core';

const workerFn = () => {
  return new Worker(
    new URL(
      '../relativePath/file/location/my-awesome-worker.js',
      import.meta.url
    ),
    {
      name: 'ohif', // name used by the browser to name the worker
    }
  );
};

const workerManager = getWebWorkerManager();

const options = {
  // maxWorkerInstances: 1,
  // overwrite: false
  // autoTerminationOnIdle: 10000
};

workerManager.registerWorker('ohif-worker', workerFn, options);
```

In the above as you see you need to create a function that returns a new Worker instance.
In order for the worker to work, it should lie in a directory that is accessible by the main thread (it can be relative
to the current directory).

:::note
There are two names that you can specify:

1. The `name` in the workerFn which is used by the browser to show the worker name in the debugger
2. The registration name, which we later use to invoke the functions

:::

### `executeTask`

Until now, the manager only knows about the workers that are available, but it doesn't know what to do with them.

the `executeTask` is used to execute a task on a worker. It takes the following arguments:

- `workerName`: the name of the worker type that we registered earlier
- `methodName`: the name of the method that we want to execute on the worker (the function name, in the above example `fib` or `inc`)
- `args` (`default = {}`): the arguments that are passed to the function. The arguments should be serializable which means you cannot pass DOM elements, functions, or any other non-serializable objects as arguments (check below on how to pass non-serializable functions)
- `options` an object with the following properties:
  - `requestType (default = RequestType.Compute)` : the group of the request. This is used to prioritize the requests. The default is `RequestType.Compute` which is the lowest priority.
    Other groups in order of priority are `RequestType.Interaction` and `RequestType.Thumbnail`, `RequestType.Prefetch`
  - `priority` (`default = 0`): the priority of the request within the specified group. The lower the number the higher the priority.
  - `options` (`default= {}`): the options to the pool manager (you most likely don't need to change this)
  - `callbacks` (`default = []`): pass in any functions that you want to be called inside the worker.

Now to execute the `fib` function on the worker we would do the following:

```js
import { getWebWorkerManager } from '@cornerstonejs/core';

const workerManager = getWebWorkerManager();
workerManager.executeTask('ohif-worker', 'fib', { value: 10 });
```

The above will execute the `fib` function on the worker with the name `ohif-worker` with the argument `{value: 10}`. Of course this is a simplified
example, often you need to perform some actions when the task is completed or failed. Since the return of the
`executeTask` is a promise, you can use the `then` and `catch` methods to handle the result.

```js
workerManager
  .executeTask('ohif-worker', 'fib', { value: 10 })
  .then((result) => {
    console.log('result', result);
  })
  .catch((error) => {
    console.error('error', error);
  });
```

or simply you can await the result

```js
try {
  const result = await workerManager.executeTask('ohif-worker', 'fib', {
    value: 10,
  });
  console.log('result', result);
} catch (error) {
  console.error('error', error);
}
```

### `eventListeners`

Sometimes, it is necessary to provide a callback function to the worker. For instance, if you wish to update the user interface when the worker makes progress. As mentioned earlier, it is not possible to directly pass a function as an argument to the worker. However, you can overcome this issue by utilizing the `callbacks` property in the options. These `callbacks` are conveniently passed as arguments to the function based on their position.

Real Example from the codebase:

```js
const results = await workerManager.executeTask(
  'polySeg',
  'convertContourToSurface',
  {
    polylines,
    numPointsArray,
  },
  {
    callbacks: [
      (progress) => {
        console.debug('progress', progress);
      },
    ],
  }
);
```

Above as you can see we pass a function to the worker as a callback. The function is passed as the NEXT argument to the worker after the args.

In the worker we have

```js
import { expose } from 'comlink';

const obj = {
  async convertContourToSurface(args, ...callbacks) {
    const { polylines, numPointsArray } = args;
    const [progressCallback] = callbacks;
    await this.initializePolySeg(progressCallback);
    const results = await this.polySeg.instance.convertContourRoiToSurface(
      polylines,
      numPointsArray
    );

    return results;
  },
};

expose(obj);
```

### `terminate`

For terminating a worker you can use `webWorkerManager.terminate(workerName)`. Stops all instances of a given worker and cleans up resources.
