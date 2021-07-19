import { eventTarget, triggerEvent } from '@ohif/cornerstone-render'
import { CornerstoneTools3DEvents } from '../enums'
import { ToolSpecificToolData } from '../types'

/*
 * Types
 */

type LockedToolDataChangeDetails = {
  // List of instances changed to locked state by the last operation.
  added: Array<ToolSpecificToolData>
  // List of instances removed from locked state by the last operation.
  removed: Array<ToolSpecificToolData>
  // Updated list of currently locked instances
  locked: Array<ToolSpecificToolData>
}

/*
 * Constants
 */

const globalSetOfLockedToolData: Set<ToolSpecificToolData> = new Set()

/*
 * Interface (Public API)
 */

/**
 * Set the "Locked" state of a given tool data instance.
 *
 * @triggers LOCKED_TOOL_DATA_CHANGE
 * @param {ToolSpecificToolData} toolData The tool data instance which will have
 * its locked state changed. An event will only be triggered if the locked state
 * of the given tool data instance changed.
 * @param {boolean} [locked=true] A boolean value indicating if the instance should
 * be locked (true) or not (false)
 */
function setToolDataLocked(
  toolData: ToolSpecificToolData,
  locked = true
): void {
  const detail = makeEventDetail()
  if (toolData) {
    if (locked) {
      lock(toolData, globalSetOfLockedToolData, detail)
    } else {
      unlock(toolData, globalSetOfLockedToolData, detail)
    }
  }
  publish(detail, globalSetOfLockedToolData)
}

function lockToolDataList(toolDataList: ToolSpecificToolData[]): void {
  const detail = makeEventDetail()
  toolDataList.forEach((toolData) => {
    lock(toolData, globalSetOfLockedToolData, detail)
  })
  publish(detail, globalSetOfLockedToolData)
}

function unlockAllToolData(): void {
  const detail = makeEventDetail()
  clearLockedToolDataSet(globalSetOfLockedToolData, detail)
  publish(detail, globalSetOfLockedToolData)
}

function getLockedToolData(): Array<ToolSpecificToolData> {
  return Array.from(globalSetOfLockedToolData)
}

function getLockedToolDataByUID(toolDataUID: string): ToolSpecificToolData {
  return getLockedToolData().find((toolData) => {
    return toolData.metadata.toolDataUID === toolDataUID
  })
}

function isToolDataLocked(toolData: ToolSpecificToolData): boolean {
  return globalSetOfLockedToolData.has(toolData)
}

function getCountOfLockedToolData(): number {
  return globalSetOfLockedToolData.size
}

function checkAndDefineIsLockedProperty(toolData: ToolSpecificToolData): void {
  if (toolData) {
    const isLocked = !!toolData.isLocked
    if (shouldDefineIsLockedProperty(toolData)) {
      Object.defineProperty(toolData, 'isLocked', {
        configurable: false,
        enumerable: true,
        set: setIsLocked,
        get: getIsLocked,
      })
    }
    setToolDataLocked(toolData, isLocked)
  }
}

/*
 * Private Helpers
 */

function makeEventDetail(): LockedToolDataChangeDetails {
  return Object.freeze({
    added: [],
    removed: [],
    locked: [],
  })
}

function lock(
  toolData: ToolSpecificToolData,
  lockedToolDataSet: Set<ToolSpecificToolData>,
  detail: LockedToolDataChangeDetails
): void {
  if (!lockedToolDataSet.has(toolData)) {
    lockedToolDataSet.add(toolData)
    detail.added.push(toolData)
  }
}

function unlock(
  toolData: ToolSpecificToolData,
  lockedToolDataSet: Set<ToolSpecificToolData>,
  detail: LockedToolDataChangeDetails
): void {
  if (lockedToolDataSet.delete(toolData)) {
    detail.removed.push(toolData)
  }
}

function clearLockedToolDataSet(
  lockedToolDataSet: Set<ToolSpecificToolData>,
  detail: LockedToolDataChangeDetails
): void {
  lockedToolDataSet.forEach((toolData) => {
    unlock(toolData, lockedToolDataSet, detail)
  })
}

function publish(
  detail: LockedToolDataChangeDetails,
  lockedToolDataSet: Set<ToolSpecificToolData>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    lockedToolDataSet.forEach((item) => void detail.locked.push(item))
    triggerEvent(
      eventTarget,
      CornerstoneTools3DEvents.LOCKED_TOOL_DATA_CHANGE,
      detail
    )
  }
}

function shouldDefineIsLockedProperty(toolData: ToolSpecificToolData): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(toolData, 'isLocked')
  if (descriptor) {
    return (
      descriptor.configurable &&
      (descriptor.set !== setIsLocked || descriptor.get !== getIsLocked)
    )
  }
  return Object.isExtensible(toolData)
}

function setIsLocked(locked: boolean) {
  setToolDataLocked(this as ToolSpecificToolData, locked)
}

function getIsLocked() {
  return isToolDataLocked(this as ToolSpecificToolData)
}

/*
 * Exports
 */

export {
  LockedToolDataChangeDetails,
  setToolDataLocked,
  lockToolDataList,
  unlockAllToolData,
  getLockedToolData,
  getLockedToolDataByUID,
  isToolDataLocked,
  getCountOfLockedToolData,
  checkAndDefineIsLockedProperty,
}
