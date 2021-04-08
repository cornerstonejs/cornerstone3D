import { loadImage, loadAndCacheImage } from '../imageLoader'
import cache from '../cache/cache'
import { getMaxSimultaneousRequests } from './getMaxSimultaneousRequests'

const requestPool = {
  interaction: [],
  thumbnail: [],
  prefetch: [],
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

function addRequest(
  requestFn: () => Promise<void>,
  type: string,
  priority: number,
  additionalDetails: Record<string, unknown>,
  addToBeginning: boolean // todo I think we plan to remove this since we have priority?
) {
  // Describe the request
  const requestDetails: RequestDetailsInterface = {
    requestFn,
    type,
    additionalDetails: {},
  }

  if (addToBeginning) {
    // Add it to the beginning of the stack
    requestPool[type].unshift(requestDetails)
  } else {
    // Add it to the end of the stack
    requestPool[type].push(requestDetails)
  }

  // Wake up
  awake = true
}

function filterRequests(
  filterFunction: (requestDetails: RequestDetailsInterface) => boolean
): void {
  Object.keys(requestPool).forEach((type: string) => {
    requestPool[type] = requestPool[type].filter(
      (requestDetails: RequestDetailsInterface) => {
        return filterFunction(requestDetails)
      }
    )
  })
}

function clearRequestStack(type: string): void {
  // Console.log('clearRequestStack');
  if (!requestPool[type]) {
    throw new Error(`No category for the type ${type} found`)
  }

  requestPool[type] = []
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

function startGrabbing() {
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

function getNextRequest() {
  if (
    requestPool.interaction.length &&
    numRequests.interaction < maxNumRequests.interaction
  ) {
    return requestPool.interaction.shift()
  }

  if (
    requestPool.thumbnail.length &&
    numRequests.thumbnail < maxNumRequests.thumbnail
  ) {
    return requestPool.thumbnail.shift()
  }

  if (
    requestPool.prefetch.length &&
    numRequests.prefetch < maxNumRequests.prefetch
  ) {
    return requestPool.prefetch.shift()
  }

  if (
    !requestPool.interaction.length &&
    !requestPool.thumbnail.length &&
    !requestPool.prefetch.length
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
