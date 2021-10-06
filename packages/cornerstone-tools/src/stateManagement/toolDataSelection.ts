import { eventTarget, triggerEvent } from '@ohif/cornerstone-render'
import { CornerstoneTools3DEvents } from '../enums'
import { ToolSpecificToolData } from '../types'

/*
 * Types
 */

type SelectionChangeDetail = {
  // Items added to selection
  added: Array<ToolSpecificToolData>
  // Items removed from selection
  removed: Array<ToolSpecificToolData>
  // Updated selection snapshot
  selection: Array<ToolSpecificToolData>
}

/*
 * Constants
 */

const selectedToolData: Set<ToolSpecificToolData> = new Set()

/*
 * Interface (Public API)
 */

/**
 * Set a given tool data instance as selected.
 *
 * @param {ToolSpecificToolData} toolData The tool data instance to be selected
 * @param {boolean} [preserveSelected=false] When true, preserves existing
 *  selections (i.e., the given tool data is appended to the selection set).
 *  When false (the default behavior) the currently selected items are discarded
 *  (i.e., the given tool data instance replaces the currently selected ones).
 */
function selectToolData(
  toolData: ToolSpecificToolData,
  preserveSelected = false
): void {
  const detail = makeEventDetail()
  if (!preserveSelected) {
    clearSelectionSet(selectedToolData, detail)
  }
  if (toolData && !selectedToolData.has(toolData)) {
    selectedToolData.add(toolData)
    detail.added.push(toolData)
  }
  publish(detail, selectedToolData)
}

/**
 * Deselect one or all tool data instances.
 *
 * @param {ToolSpecificToolData} [toolData] Optional. If a tool data instance is
 * provided that instance will be removed from the internal selection set.
 * If none is given, ALL selections will be cleared.
 */
function deselectToolData(toolData?: ToolSpecificToolData): void {
  const detail = makeEventDetail()
  if (toolData) {
    if (selectedToolData.delete(toolData)) {
      detail.removed.push(toolData)
    }
  } else {
    clearSelectionSet(selectedToolData, detail)
  }
  publish(detail, selectedToolData)
}

function getSelectedToolData(): Array<ToolSpecificToolData> {
  return Array.from(selectedToolData)
}

function getSelectedToolDataByUID(toolDataUID: string): ToolSpecificToolData {
  return getSelectedToolData().find((toolData) => {
    return toolData.metadata.toolDataUID === toolDataUID
  })
}

function getSelectedToolDataByToolName(
  toolName: string
): Array<ToolSpecificToolData> {
  return getSelectedToolData().filter((toolData) => {
    return toolData.metadata.toolName === toolName
  })
}

function isToolDataSelected(toolData: ToolSpecificToolData): boolean {
  return selectedToolData.has(toolData)
}

function getSelectionSize(): number {
  return selectedToolData.size
}

/*
 * Private Helpers
 */

function makeEventDetail(): SelectionChangeDetail {
  return Object.freeze({
    added: [],
    removed: [],
    selection: [],
  })
}

function clearSelectionSet(
  selectionSet: Set<ToolSpecificToolData>,
  detail: SelectionChangeDetail
): void {
  selectionSet.forEach((value) => {
    if (selectionSet.delete(value)) {
      detail.removed.push(value)
    }
  })
}

function publish(
  detail: SelectionChangeDetail,
  selectionSet: Set<ToolSpecificToolData>
) {
  if (detail.added.length > 0 || detail.removed.length > 0) {
    selectionSet.forEach((item) => void detail.selection.push(item))
    triggerEvent(
      eventTarget,
      CornerstoneTools3DEvents.MEASUREMENT_SELECTION_CHANGE,
      detail
    )
  }
}

/*
 * Exports
 */

export {
  SelectionChangeDetail,
  selectToolData,
  deselectToolData,
  getSelectedToolData,
  getSelectedToolDataByUID,
  getSelectedToolDataByToolName,
  isToolDataSelected,
  getSelectionSize,
}
