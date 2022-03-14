import { eventTarget, triggerEvent } from '@precisionmetrics/cornerstone-render'
import { CornerstoneTools3DEvents } from '../../enums'
import { ToolSpecificToolData } from '../../types'

/*
 * Types
 */

export type SelectionChangeDetail = {
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
 * Set a given toolData as selected.
 *
 * @param toolData - The toolData to be selected
 * @param preserveSelected - When true, preserves existing
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
 * Deselect one or all toolData instances.
 *
 * @param toolData - If a toolData is provided that instance will be removed from
 * the internal selection set. If none is given, ALL selections will be cleared.
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

/**
 * Return an array of ALL the selected tool data
 * @returns An array of ToolSpecificToolData objects.
 */
function getSelectedToolData(): Array<ToolSpecificToolData> {
  return Array.from(selectedToolData)
}

/**
 * Given a toolDataUID, return the ToolSpecificToolData object that has that
 * toolDataUID
 * @param toolDataUID - The UID of the toolData to be retrieved.
 * @returns A ToolSpecificToolData object.
 */
function getSelectedToolDataByUID(toolDataUID: string): ToolSpecificToolData {
  return getSelectedToolData().find((toolData) => {
    return toolData.metadata.toolDataUID === toolDataUID
  })
}

/**
 * Given a tool name, return ALL the tool data for that tool that are selected
 * @param toolName - The name of the tool you want to get the selected tool data for
 * @returns An array of tool specific tool data that are selected
 */
function getSelectedToolDataByToolName(
  toolName: string
): Array<ToolSpecificToolData> {
  return getSelectedToolData().filter((toolData) => {
    return toolData.metadata.toolName === toolName
  })
}

/**
 * Given a toolData object, return true if it is selected, false
 * otherwise.
 * @param toolData - ToolSpecificToolData
 * @returns A boolean value.
 */
function isToolDataSelected(toolData: ToolSpecificToolData): boolean {
  return selectedToolData.has(toolData)
}

/**
 * Return the number of the selected tool data
 * @returns The size of the selected tool data set
 */
function getSelectedToolDataCount(): number {
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
  selectToolData,
  deselectToolData,
  getSelectedToolData,
  getSelectedToolDataByUID,
  getSelectedToolDataByToolName,
  isToolDataSelected,
  getSelectedToolDataCount,
}
