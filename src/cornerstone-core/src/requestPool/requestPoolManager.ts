import { getMaxSimultaneousRequests } from './getMaxSimultaneousRequests'
// priority is fixed for interaction and thumbnail to be 0, however,
// the priority of prefetch can be configured and it can have priorities other
// than 0 (highest priority)
const requestPool = {
  interaction: { 0: [] },
  thumbnail: { 0: [] },
  prefetch: { 0: [] },
}

const numRequests = {
  interaction: 0,
  thumbnail: 0,
  prefetch: 0,
}

let maxNumRequests = {
  interaction: 6,
  thumbnail: 6,
  prefetch: 5,
}

let awake = false
const grabDelay = 5

type RequestDetailsInterface = {
  requestFn: () => Promise<void>
  type: string
  additionalDetails: any
}

/**
 * Adds the requests to the pool of requests.
 *
 * @param requestFn - A function that returns a promise which resolves in the image
 * @param type - Priority category, it can be either of interaction, prefetch,
 * or thumbnail.
 * @param additionalDetails - Additional details that requests can contain.
 * For instance the volumeUID for the volume requests
 * @param priority - Priority number for each category of requests. Its default
 * value is priority 0. The lower the priority number, the higher the priority number
 *
 * @returns void
 *
 */
function addRequest(
  requestFn: () => Promise<void>,
  type: string,
  additionalDetails: Record<string, unknown>,
  priority = 0
): void {
  // Describe the request
  const requestDetails: RequestDetailsInterface = {
    requestFn,
    type,
    additionalDetails,
  }

  // Check if the priority group exists on the request type
  if (requestPool[type][priority] === undefined) {
    requestPool[type][priority] = []
  }

  // Adding the request to the correct priority group of the request type
  requestPool[type][priority].push(requestDetails)

  // Wake up
  awake = true
}

function filterRequests(
  filterFunction: (requestDetails: RequestDetailsInterface) => boolean
): void {
  Object.keys(requestPool).forEach((type: string) => {
    const requestType = requestPool[type]
    Object.keys(requestType).forEach((priority) => {
      requestType[priority] = requestType[priority].filter(
        (requestDetails: RequestDetailsInterface) => {
          return filterFunction(requestDetails)
        }
      )
    })
  })
}

function clearRequestStack(type: string): void {
  // Console.log('clearRequestStack');
  if (!requestPool[type]) {
    throw new Error(`No category for the type ${type} found`)
  }

  requestPool[type] = { 0: [] }
}

function startAgain(): void {
  if (!awake) {
    return
  }

  setTimeout(function () {
    startGrabbing()
  }, grabDelay)
}

function sendRequest({ requestFn, type }: RequestDetailsInterface) {
  // Increment the number of current requests of this type
  numRequests[type]++
  awake = true

  requestFn().finally(() => {
    numRequests[type]--

    startAgain()
  })
}

function startGrabbing(): void {
  // Begin by grabbing X images
  const maxSimultaneousRequests = getMaxSimultaneousRequests()

  maxNumRequests = {
    interaction: Math.max(maxSimultaneousRequests, 1),
    thumbnail: Math.max(maxSimultaneousRequests - 2, 1),
    prefetch: Math.max(maxSimultaneousRequests - 1, 1),
  }

  const currentRequests =
    numRequests.interaction + numRequests.thumbnail + numRequests.prefetch
  const requestsToSend = maxSimultaneousRequests - currentRequests

  for (let i = 0; i < requestsToSend; i++) {
    const requestDetails = getNextRequest()

    if (requestDetails) {
      sendRequest(requestDetails)
    }
  }
}

function getSortedPriorityGroups(type) {
  const priorities = Object.keys(requestPool[type])
    .filter((priority) => requestPool[type][priority].length)
    .sort()
  return priorities
}

function getNextRequest() {
  const interactionPriorities = getSortedPriorityGroups('interaction')

  for (const priority of interactionPriorities) {
    if (
      requestPool.interaction[priority].length &&
      numRequests.interaction < maxNumRequests.interaction
    ) {
      return requestPool.interaction[priority].shift()
    }
  }

  const thumbnailPriorities = getSortedPriorityGroups('thumbnail')

  for (const priority of thumbnailPriorities) {
    if (
      requestPool.thumbnail[priority].length &&
      numRequests.thumbnail < maxNumRequests.thumbnail
    ) {
      return requestPool.thumbnail[priority].shift()
    }
  }

  // const t0 = performance.now()
  const prefetchPriorities = getSortedPriorityGroups('prefetch')
  // const t1 = performance.now()
  // console.debug('Call to doSomething took ' + (t1 - t0) + ' milliseconds.')

  for (const priority of prefetchPriorities) {
    if (
      requestPool.prefetch[priority].length &&
      numRequests.prefetch < maxNumRequests.prefetch
    ) {
      return requestPool.prefetch[priority].shift()
    }
  }

  if (
    !interactionPriorities.length &&
    !thumbnailPriorities.length &&
    !prefetchPriorities.length
  ) {
    awake = false
  }

  return false
}

function getRequestPool() {
  return requestPool
}

export default {
  addRequest,
  clearRequestStack,
  startGrabbing,
  getRequestPool,
  filterRequests,
}
