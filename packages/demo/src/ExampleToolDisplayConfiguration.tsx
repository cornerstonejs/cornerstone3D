import React, { Component } from 'react'
import {
  cache,
  Settings,
  getRenderingEngines,
  RenderingEngine,
  createAndCacheVolume,
  metaData,
  eventTarget,
  ORIENTATION,
  VIEWPORT_TYPE,
  init as csRenderInit,
} from '@precisionmetrics/cornerstone-render'
import {
  CornerstoneTools3DEvents,
  ToolBindings,
  toolDataLocking,
  toolDataSelection,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleToolDisplayConfiguration.css'
import {
  renderingEngineUID,
  ctVolumeUID,
  ctStackUID,
  SCENE_IDS,
  VIEWPORT_IDS,
} from './constants'
import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import * as cs from '@precisionmetrics/cornerstone-render'
import config from './config/default'
import { hardcodedMetaDataProvider } from './helpers/initCornerstone'

import { registerWebImageLoader } from '@precisionmetrics/cornerstone-image-loader-streaming-volume'

const VIEWPORT_DX_COLOR = 'dx_and_color_viewport'

const VOLUME = 'volume'
const STACK = 'stack'

let ctSceneToolGroup, stackCTViewportToolGroup, stackDXViewportToolGroup

class ToolDisplayConfigurationExample extends Component {
  listOfTools = [
    'WindowLevel',
    'Length',
    'Bidirectional',
    'RectangleRoi',
    'EllipticalRoi',
    'Probe',
  ]

  _elementNodes = null
  _viewportGridRef = null
  _offScreenRef = null
  ctVolumeImageIdsPromise = null
  ctStackImageIdsPromise = null
  dxImageIdsPromise = null
  colorImageIds = null
  renderingEngine = null
  viewportGridResizeObserver = null
  ctVolumeUID = null
  ctStackUID = null

  activeToolByGroup = new WeakMap()

  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    activeTools: 'WindowLevel',
    layoutIndex: 0,
    destroyed: false,
    viewportGrid: {
      numCols: 2,
      numRows: 2,
      viewports: [{}, {}, {}, {}],
    },
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
  }

  constructor(props) {
    super(props)

    registerWebImageLoader(cs)
    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    this._offScreenRef = React.createRef()

    this.ctVolumeImageIdsPromise = getImageIds('ct1', VOLUME)

    this.ctStackImageIdsPromise = getImageIds('ct1', STACK)
    this.dxImageIdsPromise = getImageIds('dx', STACK)

    this.colorImageIds = config.colorImages.imageIds

    metaData.addProvider(
      (type, imageId) =>
        hardcodedMetaDataProvider(type, imageId, this.colorImageIds),
      10000
    )

    this.viewportGridResizeObserver = new ResizeObserver((entries) => {
      // ThrottleFn? May not be needed. This is lightning fast.
      // Set in mount
      if (this.renderingEngine) {
        this.renderingEngine.resize()
        this.renderingEngine.render()
      }
    })
  }

  /**
   * LIFECYCLE
   */
  async componentDidMount() {
    await csRenderInit()
    csTools3d.init()
    ;({ ctSceneToolGroup, stackCTViewportToolGroup, stackDXViewportToolGroup } =
      initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ctStackUID = ctStackUID

    // Create volumes
    const dxImageIds = await this.dxImageIdsPromise
    const ctStackImageIds = await this.ctStackImageIdsPromise
    const ctVolumeImageIds = await this.ctVolumeImageIdsPromise
    const colorImageIds = this.colorImageIds

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    const viewportInput = [
      // CT volume axial
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.AXIAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(0),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: SCENE_IDS.CT,
        viewportUID: VIEWPORT_IDS.CT.SAGITTAL,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        element: this._elementNodes.get(1),
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      // stack CT
      {
        viewportUID: VIEWPORT_IDS.STACK.CT,
        type: VIEWPORT_TYPE.STACK,
        element: this._elementNodes.get(2),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      // dx
      {
        viewportUID: VIEWPORT_IDS.STACK.DX,
        type: VIEWPORT_TYPE.STACK,
        element: this._elementNodes.get(3),
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
    ]

    renderingEngine.setViewports(viewportInput)

    // volume ct
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.AXIAL
    )
    ctSceneToolGroup.addViewports(
      renderingEngineUID,
      SCENE_IDS.CT,
      VIEWPORT_IDS.CT.SAGITTAL
    )

    // stack ct
    stackCTViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.CT
    )

    // dx and color
    stackDXViewportToolGroup.addViewports(
      renderingEngineUID,
      undefined,
      VIEWPORT_IDS.STACK.DX
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackDXViewportToolGroup,
    })

    renderingEngine.render()

    const stackViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.CT)

    await stackViewport.setStack(sortImageIdsByIPP(ctStackImageIds))

    // ct + dx + color
    const dxColorViewport = renderingEngine.getViewport(VIEWPORT_IDS.STACK.DX)

    const fakeStack = [
      dxImageIds[0],
      colorImageIds[0],
      dxImageIds[1],
      ctStackImageIds[40],
      colorImageIds[1],
      colorImageIds[2],
      ctStackImageIds[41],
    ]
    await dxColorViewport.setStack(fakeStack)

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoad = () => this.setState({ progressText: 'Loaded.' })

    ctVolume.load(onLoad)

    const ctScene = renderingEngine.getScene(SCENE_IDS.CT)
    ctScene.setVolumes([
      {
        volumeUID: ctVolumeUID,
      },
    ])

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialise volumes in GPU memory
    renderingEngine.render()
    // Start listening for resize
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)

    // Update Tool Style Settings
    displayToolStyleValues()

    // Register for Tool Data Selection Event
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.MEASUREMENT_SELECTION_CHANGE,
      onMeasurementSelectionChange
    )

    // Register for Tool Data Locking Event
    eventTarget.addEventListener(
      CornerstoneTools3DEvents.LOCKED_TOOL_DATA_CHANGE,
      onLockedToolDataChange
    )

    // Set WindowLevel tool as active in order to initialize the mouse cursor
    ;[
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackDXViewportToolGroup,
    ].forEach((toolGroup) => {
      toolGroup.setToolActive('WindowLevel', {
        bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
      })
    })
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    // Remove listener for Tool Data Selection Event
    eventTarget.removeEventListener(
      CornerstoneTools3DEvents.MEASUREMENT_SELECTION_CHANGE,
      onMeasurementSelectionChange
    )

    // Remove listener for Tool Data Locking Event
    eventTarget.removeEventListener(
      CornerstoneTools3DEvents.LOCKED_TOOL_DATA_CHANGE,
      onLockedToolDataChange
    )

    cache.purgeCache()
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  showOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
    const uri = this.renderingEngine._debugRender()
    const image = document.createElement('img')
    image.src = uri
    image.setAttribute('width', '100%')

    this._offScreenRef.current.appendChild(image)
  }

  hideOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  toggleActiveTool = () => {
    const defaultTool = 'WindowLevel'
    const activeTools = new Set()
    const options = {
      bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
    }

    ;[
      ctSceneToolGroup,
      stackCTViewportToolGroup,
      stackDXViewportToolGroup,
    ].forEach((toolGroup) => {
      const activeTool = this.activeToolByGroup.get(toolGroup) || defaultTool
      let newTool = activeTool
      do {
        newTool =
          this.listOfTools[
            (this.listOfTools.indexOf(newTool) + 1) % this.listOfTools.length
          ]
      } while (!toolGroup.toolOptions.hasOwnProperty(newTool))
      if (activeTool !== newTool) {
        toolGroup.setToolPassive(activeTool)
        toolGroup.setToolActive(newTool, options)
        this.activeToolByGroup.set(toolGroup, newTool)
      }
      activeTools.add(newTool)
    })

    this.setState({ activeTools: Array.from(activeTools).join('/') })
  }

  render() {
    return (
      <div>
        <div>
          <h1>Tool Display Configuration Example</h1>
          {!window.crossOriginIsolated ? (
            <h1 style={{ color: 'red' }}>
              This Demo requires SharedArrayBuffer but your browser does not
              support it
            </h1>
          ) : null}
          <p>
            Demo for testing selection and styling options for annotations (aka
            tool data). In order to select multiple items or <em>unselect</em>
            one, just hold the <em>SHIFT</em> key on click.
          </p>
        </div>
        <button
          onClick={() => this.toggleActiveTool()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Toggle Active Tool ({this.state.activeTools})
        </button>
        <div style={{ paddingBottom: '55px' }}>
          <ViewportGrid
            numCols={this.state.viewportGrid.numCols}
            numRows={this.state.viewportGrid.numRows}
            renderingEngine={this.renderingEngine}
            style={{ minHeight: '650px', marginTop: '35px' }}
            ref={this._viewportGridRef}
          >
            {this.state.viewportGrid.viewports.map((vp, i) => (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '2px solid grey',
                  background: 'black',
                  ...(vp.cellStyle || {}),
                }}
                ref={(c) => this._elementNodes.set(i, c)}
                onContextMenu={(e) => e.preventDefault()}
                key={i}
              />
            ))}
          </ViewportGrid>
        </div>
        <div>
          <h1>OffScreen Canvas Render</h1>
          <button
            onClick={this.showOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Show OffScreenCanvas
          </button>
          <button
            onClick={this.hideOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
        <div className="tool-style-controls">
          <span className="hover-handle">HOVER</span>
          <h1>Tool Style Controls</h1>
          <div className="controls-wrapper">
            <div className="control-elements">
              <label>Target:</label>
              <input
                type="text"
                id="output-target"
                name="ouput-target"
                placeholder="Runtime Settings"
                disabled={true}
              />
              <button
                id="use-selected-annotation"
                onClick={onUseSelectedAnnotation}
              >
                Use Selected Annotation
              </button>
              <button onClick={onUseRuntimeSettings}>
                Use Runtime Settings
              </button>
              <button onClick={displayToolStyleValues}>Refresh</button>
              <button onClick={onReset}>Reset</button>
              <button onClick={onLockSelected}>Lock Selected</button>
              <button onClick={onUnlockAll}>Unlock All</button>
              <button onClick={onExportSettings}>Export Settings (JSON)</button>
              <label>Import Settings (JSON):</label>
              <input
                type="file"
                accept="application/json,.json"
                onChange={onFileInputChange}
              />
            </div>
            <div className="input-elements">
              {getAllSettings().map((name) => (
                <ToolStyleControl key={name} name={name} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

function onExportSettings(e: React.MouseEvent<HTMLElement>) {
  const settings = getTargetSettings()
  const blob = new Blob([JSON.stringify(settings.dump(), null, 2)], {
    type: 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const previousUrl = e.currentTarget.dataset.previousUrl
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl)
  }
  e.currentTarget.dataset.previousUrl = url
  const a = document.createElement('a')
  a.href = url
  a.download = `settings-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function onLockSelected() {
  toolDataLocking.lockToolDataList(toolDataSelection.getSelectedToolData())
}

function onUnlockAll() {
  toolDataLocking.unlockAllToolData()
}

function onLockedToolDataChange(e: CustomEvent) {
  console.info('Locked Tool Data Changed:', e.detail)
  getRenderingEngines().forEach((renderEngine) => renderEngine.render())
}

function onUseRuntimeSettings() {
  updateTargetElement('')
}

function onUseSelectedAnnotation(e: React.MouseEvent<HTMLElement>) {
  const targetId = (e.currentTarget.dataset.targetId || '') + ''
  updateTargetElement(targetId)
}

function onFileInputChange(e: React.FormEvent<HTMLInputElement>) {
  const fileInput = e.target as HTMLInputElement
  if (fileInput.files.length > 0) {
    const reader = new FileReader()
    reader.onload = function () {
      try {
        const json = reader.result + ''
        console.info('Loaded JSON:', json)
        const settings = JSON.parse(json)
        getTargetSettings().import(settings)
        displayToolStyleValues()
        getRenderingEngines().forEach((renderEngine) => renderEngine.render())
      } catch (e) {
        console.error('Error reading settings JSON', e)
      }
    }
    reader.readAsText(fileInput.files[0])
  } else {
    console.info('No file selected...')
  }
}

function onMeasurementSelectionChange(e: CustomEvent): void {
  let toolData = null
  const { added, selection } = e.detail
  if (added.length > 0) {
    toolData = added[0]
  } else if (selection.length > 0) {
    // Use the previous selection
    toolData = selection[selection.length - 1]
  }
  ;(
    document.querySelector(
      '.tool-style-controls button#use-selected-annotation'
    ) as HTMLElement
  ).dataset.targetId = toolData
    ? `toolData:${toolData.metadata.toolDataUID}`
    : ''
  getRenderingEngines().forEach((renderEngine) => renderEngine.render())
}

function updateTargetElement(targetId: string): void {
  ;(
    document.querySelector(
      '.tool-style-controls input#output-target'
    ) as HTMLInputElement
  ).value = targetId
  displayToolStyleValues()
}

function displayToolStyleValues() {
  const settings = getTargetSettings()
  const nodeList = document.querySelectorAll(
    '.tool-style-controls .input-elements .tool-style-control input'
  )
  for (let i = 0; i < nodeList.length; ++i) {
    const item = nodeList[i] as HTMLInputElement
    const name = item.name
    item.value = ''
    item.placeholder = formatValue(settings.get(name))
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  } else {
    return value === undefined || value === null ? '' : value + ''
  }
}

function getTargetSettings(): Settings {
  let settings: Settings
  const output = document.querySelector(
    '.tool-style-controls .control-elements input#output-target'
  ) as HTMLInputElement
  const target = getTargetFromTargetId(output.value + '')
  if (typeof target === 'object' && target !== null) {
    settings = Settings.getObjectSettings(target)
  } else {
    settings = Settings.getRuntimeSettings()
    output.value = ''
  }
  console.info('Target settings:', settings)
  return settings
}

function getTargetFromTargetId(id: string): unknown {
  const toolDataRegex = /^toolData:(.+)$/
  let match
  if ((match = toolDataRegex.exec(id)) !== null) {
    return toolDataSelection.getSelectedToolDataByUID(match[1])
  }
}

/*
 * Utility to get a sorted list of all settings properties
 */

function getAllSettings() {
  const names = []
  Settings.getDefaultSettings().forEach((name) => {
    names.push(name)
  })
  names.sort((a, b) => {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })
  return names
}

/*
 * Utilities to facilitate setting or unsetting a property from
 * the selected target
 */

function setStyleProperty(name: string, value: unknown): void {
  const settings = getTargetSettings()
  if (settings.set(name, value)) {
    displayToolStyleValues()
    getRenderingEngines().forEach((renderEngine) => renderEngine.render())
    console.info('Style property "%s" successfully set!', name)
  } else {
    console.error('Failed to set style property "%s"...', name)
  }
}

function unsetStyleProperty(name: string) {
  const settings = getTargetSettings()
  if (settings.unset(name)) {
    displayToolStyleValues()
    getRenderingEngines().forEach((renderEngine) => renderEngine.render())
    console.info('Style property "%s" successfully unset!', name)
  } else {
    console.error('Failed to unset style property "%s"...', name)
  }
}

/*
 * Event handlers for the buttons next to the input fields
 * (and other buttons)
 */

function onSetProperty(e: React.MouseEvent<HTMLElement>): void {
  const input = e.currentTarget.parentElement.querySelector('input')
  if (input) {
    setStyleProperty(input.name + '', input.value + '')
  } else {
    console.error('Input field not found for set operation...')
  }
}

function onUnsetProperty(e: React.MouseEvent<HTMLElement>) {
  const input = e.currentTarget.parentElement.querySelector('input')
  if (input) {
    unsetStyleProperty(input.name + '')
  } else {
    console.error('Input field not found for unset operation...')
  }
}

function onReset() {
  unsetStyleProperty('.')
}

/*
 * Tool Style Control Component
 */

function ToolStyleControl(props) {
  const prefix = 'tool.style.'
  return (
    <div className="tool-style-control">
      <label htmlFor={props.name}>{props.name.slice(prefix.length)}:</label>
      <div className="input-fields">
        <input type="text" id={props.name} name={props.name} />
        <button onClick={onSetProperty}>➔</button>
        <button onClick={onUnsetProperty}>✖</button>
      </div>
    </div>
  )
}

export default ToolDisplayConfigurationExample
