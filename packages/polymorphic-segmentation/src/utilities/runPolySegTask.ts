import { getWebWorkerManager } from '@cornerstonejs/core';

type WaitingTask = {
  start: () => void;
  urgent: boolean;
};

/**
 * The tasks that wait for an instance of the polySeg worker, urgent ones
 * first and each kind in the order asked, and the number of tasks sent.
 */
const waitingTasks: WaitingTask[] = [];
let sentTasks = 0;

function getInstanceCount(): number {
  return getWebWorkerManager().workerRegistry?.polySeg?.instances.length || 1;
}

function takeInstance(urgent: boolean): Promise<void> {
  if (sentTasks < getInstanceCount() && !waitingTasks.length) {
    sentTasks++;
    return Promise.resolve();
  }

  return new Promise((start) => {
    const task = { start, urgent };
    const firstNotUrgent = urgent
      ? waitingTasks.findIndex((waiting) => !waiting.urgent)
      : -1;

    if (firstNotUrgent === -1) {
      waitingTasks.push(task);
    } else {
      waitingTasks.splice(firstNotUrgent, 0, task);
    }
  });
}

/**
 * Frees the instance of a finished task and sends the tasks that wait first
 * while instances are free, in a later task of the event loop: the tasks that
 * the result of the finished one asks for (the cut of a surface that was just
 * made) are then waiting, and an urgent one goes first.
 */
function releaseInstance(): void {
  setTimeout(() => {
    sentTasks--;

    while (waitingTasks.length && sentTasks < getInstanceCount()) {
      sentTasks++;
      waitingTasks.shift().start();
    }
  }, 0);
}

/**
 * Sends a task to the polySeg worker when one of its instances is free: at
 * most one task per instance is sent at a time. An instance runs the tasks
 * that it holds one after the other in the order they came, and the web
 * worker manager gives a task to an instance by the number of tasks that it
 * holds, not by how long they take; with one task per instance, no task
 * waits behind a long conversion that another instance could have run. An
 * urgent task (the cut of surfaces by the slices of a viewport) goes before
 * the waiting tasks that are not (the conversions of contours to surfaces).
 *
 * @param send - Sends the task, `workerManager.executeTask('polySeg', ...)`.
 * @param urgent - Whether the task goes before the tasks that are not urgent.
 * @returns The result of the task.
 */
export async function runPolySegTask<T>(
  send: () => Promise<T>,
  urgent = false
): Promise<T> {
  await takeInstance(urgent);

  try {
    return await send();
  } finally {
    releaseInstance();
  }
}
