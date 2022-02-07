import React, { Component } from 'react'

import { vec3 } from 'gl-matrix'

import {
  cache,
  RenderingEngine,
  createAndCacheVolume,
  createAndCacheDerivedVolume,
} from '@precisionmetrics/cornerstone-render'
import {
  // Segmentation
  SegmentationModule,
  lockedSegmentController,
  segmentIndexController,
  activeLabelmapController,
  hideSegmentController,
  synchronizers,
  ToolBindings,
  ToolModes,
  CornerstoneTools3DEvents,
  toolDataSelection,
  Utilities as csToolsUtils,
} from '@precisionmetrics/cornerstone-tools'
import * as csTools3d from '@precisionmetrics/cornerstone-tools'

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineUID,
  ptVolumeUID,
  ctVolumeUID,
  colormaps,
  SCENE_IDS,
  ANNOTATION_TOOLS,
  SEGMENTATION_TOOLS,
} from './constants'
import LAYOUTS, { ptCtFusion } from './layouts'
import config from './config/default'

import sortImageIdsByIPP from './helpers/sortImageIdsByIPP'
import limitImageIds from './helpers/limitImageIds'

const VOLUME = 'volume'

let ctSceneToolGroup,
  ptSceneToolGroup,
  fusionSceneToolGroup,
  ptMipSceneToolGroup,
  ctVRSceneToolGroup,
  ctObliqueToolGroup,
  ptTypesSceneToolGroup,
  ptCtLayoutTools

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const toolsToUse = [
  'WindowLevel',
  'Pan',
  'Zoom',
  ...ANNOTATION_TOOLS,
  ...SEGMENTATION_TOOLS,
]
const labelmap1UID = 'boneAndSoftTissue'
const labelmap2UID = 'fatTissue'
const RECTANGLE_ROI_THRESHOLD = 'RectangleRoiThreshold'
const RECTANGLE_ROI_THRESHOLD_MANUAL = 'RectangleRoiThresholdManual'

class SegmentationExample extends Component {
  _elementNodes = null
  _viewportGridRef = null
  _offScreenRef = null
  ctVolumeImageIds = null
  petVolumeImageIds = null
  ptThresholdSync = null
  axialSync = null
  sagittalSync = null
  coronalSync = null
  ctWLSync = null
  renderingEngine = null
  viewportGridResizeObserver = null
  ctVolumeUID = null
  ptVolumeUID = null

  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    // segmentation state
    renderOutline: true,
    renderInactiveLabelmaps: true,
    //
    viewportGrid: {
      numCols: 4,
      numRows: 3,
      viewports: [
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          cellStyle: {
            gridRow: '1 / span 3',
            gridColumn: '4',
          },
        },
      ],
    },
    ptCtLeftClickTool: 'WindowLevel',
    toolGroupName: 'ctScene',
    toolGroups: {},
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    // Segmentation
    segmentationStatus: '',
    segmentationToolActive: false,
    sceneForSegmentation: SCENE_IDS.CT,
    selectedLabelmapUID: '',
    availableLabelmaps: [],
    activeSegmentIndex: 1,
    fillAlpha: 0.9,
    fillAlphaInactive: 0.8,
    segmentLocked: false,
    thresholdMin: 0,
    thresholdMax: 100,
    numSlicesForThreshold: 1,
    selectedStrategy: '',
    tmtv: null,
  }

  constructor(props) {
    super(props)

    csTools3d.init()
    this._offScreenRef = React.createRef()

    ptCtLayoutTools = ['Levels'].concat(toolsToUse)

    this._elementNodes = new Map()
    this._viewportGridRef = React.createRef()
    const { limitFrames } = config

    const callback = (imageIds) => {
      if (limitFrames !== undefined && typeof limitFrames === 'number') {
        const NewImageIds = sortImageIdsByIPP(imageIds)
        return limitImageIds(NewImageIds, limitFrames)
      }
      return imageIds
    }

    this.petVolumeImageIds = getImageIds('pt1', VOLUME, callback)
    this.ctVolumeImageIds = getImageIds('ct1', VOLUME, callback)

    Promise.all([this.petVolumeImageIds, this.ctVolumeImageIds]).then(() =>
      this.setState({ progressText: 'Loading data...' })
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
    this.axialSync = createCameraPositionSynchronizer('axialSync')
    this.sagittalSync = createCameraPositionSynchronizer('sagittalSync')
    this.coronalSync = createCameraPositionSynchronizer('coronalSync')
    this.ctWLSync = createVOISynchronizer('ctWLSync')
    this.ptThresholdSync = createVOISynchronizer('ptThresholdSync')
    ;({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ctVRSceneToolGroup,
      ctObliqueToolGroup,
      ptTypesSceneToolGroup,
    } = initToolGroups())

    this.ctVolumeUID = ctVolumeUID
    this.ptVolumeUID = ptVolumeUID

    const renderingEngine = new RenderingEngine(renderingEngineUID)

    this.renderingEngine = renderingEngine

    window.renderingEngine = renderingEngine

    ptCtFusion.setLayout(
      renderingEngine,
      this._elementNodes,
      {
        ctSceneToolGroup,
        ptSceneToolGroup,
        fusionSceneToolGroup,
        ptMipSceneToolGroup,
      },
      {
        axialSynchronizers: [],
        sagittalSynchronizers: [],
        coronalSynchronizers: [],
        ptThresholdSynchronizer: this.ptThresholdSync,
        ctWLSynchronizer: this.ctWLSync,
      }
    )

    addToolsToToolGroups({
      ctSceneToolGroup,
      ptSceneToolGroup,
      fusionSceneToolGroup,
      ptMipSceneToolGroup,
      ctVRSceneToolGroup,
      ctObliqueToolGroup,
      ptTypesSceneToolGroup,
    })

    this.setState({
      toolGroups: {
        ctScene: ctSceneToolGroup,
        ptScene: ptSceneToolGroup,
      },
    })

    // Create volumes
    const ptImageIds = await this.petVolumeImageIds
    const ctVolumeImageIds = await this.ctVolumeImageIds

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await createAndCacheVolume(ptVolumeUID, {
      imageIds: ptImageIds,
    })
    const ctVolume = await createAndCacheVolume(ctVolumeUID, {
      imageIds: ctVolumeImageIds,
    })

    // Initialize all CT values to -1024 so we don't get a grey box?
    const { scalarData } = ctVolume
    const ctLength = scalarData.length

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024
    }

    const onLoadCT = (evt) => {
      if (evt.framesProcessed === evt.numFrames) {
        this.setState({ progressText: 'Loaded.' })
      }
    }

    ptVolume.load()
    ctVolume.load(onLoadCT)

    ptCtFusion.setVolumes(
      renderingEngine,
      ctVolumeUID,
      ptVolumeUID,
      colormaps[this.state.petColorMapIndex]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    const { renderingEngine } = this

    const layout = LAYOUTS[layoutIndex]

    this._elementNodes.forEach((element) => {
      element.addEventListener(
        CornerstoneTools3DEvents.LABELMAP_STATE_UPDATED,
        this.onLabelmapStateUpdated
      )
    })

    if (prevState.layoutIndex !== layoutIndex) {
      if (layout === 'FusionMIP') {
        // FusionMIP

        ptCtFusion.setLayout(
          renderingEngine,
          this._elementNodes,
          {
            ctSceneToolGroup,
            ptSceneToolGroup,
            fusionSceneToolGroup,
            ptMipSceneToolGroup,
          },
          {
            axialSynchronizers: [],
            sagittalSynchronizers: [],
            coronalSynchronizers: [],
            ptThresholdSynchronizer: this.ptThresholdSync,
            ctWLSynchronizer: this.ctWLSync,
          }
        )

        ptCtFusion.setVolumes(
          renderingEngine,
          ctVolumeUID,
          ptVolumeUID,
          colormaps[this.state.petColorMapIndex]
        )
      } else {
        throw new Error('Unrecognised layout index')
      }
    }
  }

  componentWillUnmount() {
    // Stop listening for resize
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect()
    }

    cache.purgeCache()
    csTools3d.destroy()
    this.renderingEngine.destroy()
  }

  onLabelmapStateUpdated = (evt) => {
    const { element } = evt.detail
    const labelmapUIDs = SegmentationModule.getLabelmapUIDsForElement(element)
    const activeLabelmapUID =
      activeLabelmapController.getActiveLabelmapUID(element)
    this.setState({
      availableLabelmaps: labelmapUIDs,
      selectedLabelmapUID: activeLabelmapUID,
    })
  }

  createNewLabelmapForScissors = async (evt) => {
    const sceneUID = evt.target.value
    const scene = this.renderingEngine.getScene(sceneUID)
    const { uid: viewportUID } = scene.getViewports()[0]
    const { element } = this.renderingEngine.getViewport(viewportUID)
    const labelmapIndex = activeLabelmapController.getNextLabelmapIndex(element)
    await activeLabelmapController.setActiveLabelmapIndex(
      element,
      labelmapIndex
    )

    // set the labelmap for all other scens
    const labelmapUID = activeLabelmapController.getActiveLabelmapUID(element)

    // get labelmap
    const labelmap = cache.getVolume(labelmapUID)

    // all the scense except the we just acted on
    const scenes = this.renderingEngine
      .getScenes()
      .filter(({ uid }) => uid !== sceneUID)

    scenes.forEach(({ uid: sceneUID }) => {
      const scene = this.renderingEngine.getScene(sceneUID)

      const { uid } = scene.getViewports()[0]

      const { element } = this.renderingEngine.getViewport(uid)

      SegmentationModule.setLabelmapForElement({
        element,
        labelmap,
      })
    })
  }

  setToolMode = (toolMode) => {
    const toolName = this.state.ptCtLeftClickTool
    if (SEGMENTATION_TOOLS.includes(toolName)) {
      this.setState({ segmentationToolActive: true })
    }
    const toolGroup = this.state.toolGroups[this.state.toolGroupName]
    if (toolMode === ToolModes.Active) {
      const activeTool = toolGroup.getActivePrimaryButtonTools()
      if (activeTool) {
        toolGroup.setToolPassive(activeTool)
      }

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: ToolBindings.Mouse.Primary }],
      })
    } else if (toolMode === ToolModes.Passive) {
      toolGroup.setToolPassive(toolName)
    } else if (toolMode === ToolModes.Enabled) {
      toolGroup.setToolEnabled(toolName)
    } else if (toolMode === ToolModes.Disabled) {
      toolGroup.setToolDisabled(toolName)
    }
  }

  fillBlobForThreshold = (
    imageData,
    backgroundImageData,
    segments = ['bone', 'softTissue', 'fatTissue']
  ) => {
    const dims = imageData.getDimensions()
    const values = imageData.getPointData().getScalars().getData()

    const backgroundValues = backgroundImageData
      .getPointData()
      .getScalars()
      .getData()
    const size = dims[0] * dims[1] * dims[2]

    // Bone
    const boneThreshold = [226, 3071]
    const softTissueThreshold = [-700, 255]
    const fatTissueThreshold = [-205, -51]

    for (let i = 0; i < size; i++) {
      if (
        segments.includes('bone') &&
        backgroundValues[i] >= boneThreshold[0] &&
        backgroundValues[i] < boneThreshold[1]
      ) {
        values[i] = 1
      }

      if (
        segments.includes('softTissue') &&
        backgroundValues[i] >= softTissueThreshold[0] &&
        backgroundValues[i] < softTissueThreshold[1]
      ) {
        values[i] = 2
      }

      if (
        segments.includes('fatTissue') &&
        backgroundValues[i] >= fatTissueThreshold[0] &&
        backgroundValues[i] < fatTissueThreshold[1]
      ) {
        values[i] = 3
      }
      //  values[i] = 1
    }

    imageData.getPointData().getScalars().setData(values)
  }

  preLoadSegmentations = async () => {
    this.setState({ segmentationStatus: '(Calculating...)' })

    // Use ct as background for segmentation threshold
    const ctViewport = this.renderingEngine.getViewport('ctAxial')
    const { vtkImageData: backgroundImageData } = ctViewport.getImageData()

    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap1UID })
    await createAndCacheDerivedVolume(ctVolumeUID, { uid: labelmap2UID })

    const boneSoftVolume = cache.getVolume(labelmap1UID)
    const fatVolume = cache.getVolume(labelmap2UID)

    // Bone & soft tissue labelmap
    this.fillBlobForThreshold(
      boneSoftVolume.vtkImageData,
      backgroundImageData,
      ['bone', 'softTissue']
    )

    // fat tissue labelmap
    this.fillBlobForThreshold(fatVolume.vtkImageData, backgroundImageData, [
      'fatTissue',
    ])

    this.setState({ segmentationStatus: 'done' })
  }

  loadSegmentation = async (sceneUID, labelmapUID) => {
    const scene = this.renderingEngine.getScene(sceneUID)
    const { uid } = scene.getViewports()[0]
    const { element } = this.renderingEngine.getViewport(uid)

    const labelmapIndex = activeLabelmapController.getNextLabelmapIndex(element)
    const labelmap = cache.getVolume(labelmapUID)

    await SegmentationModule.setLabelmapForElement({
      element,
      labelmap,
      labelmapIndex,
      labelmapViewportState: {},
    })

    const activeSegmentIndex =
      segmentIndexController.getActiveSegmentIndex(element)
    const segmentLocked =
      lockedSegmentController.getSegmentIndexLockedStatusForElement(
        element,
        activeSegmentIndex
      )

    this.setState({
      segmentationToolActive: true,
      selectedLabelmapUID:
        activeLabelmapController.getActiveLabelmapUID(element),
      activeSegmentIndex,
      segmentLocked,
    })
  }

  toggleLockedSegmentIndex = (evt) => {
    const checked = evt.target.checked
    console.debug('checked', checked)
    // Todo: Don't have active viewport concept
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { element } = scene.getViewports()[0]
    const activeLabelmapUID =
      activeLabelmapController.getActiveLabelmapUID(element)
    lockedSegmentController.toggleSegmentIndexLockedForLabelmapUID(
      activeLabelmapUID,
      this.state.activeSegmentIndex
    )
    this.setState({ segmentLocked: checked })
  }

  changeActiveSegmentIndex = (direction) => {
    // Todo: Don't have active viewport concept
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { element } = scene.getViewports()[0]
    const currentIndex = segmentIndexController.getActiveSegmentIndex(element)
    let newIndex = currentIndex + direction

    if (newIndex < 0) {
      newIndex = 0
    }

    segmentIndexController.setActiveSegmentIndex(element, newIndex)
    const segmentLocked =
      lockedSegmentController.getSegmentIndexLockedStatusForElement(
        element,
        newIndex
      )
    console.debug('segmentLocked', segmentLocked)
    this.setState({ activeSegmentIndex: newIndex, segmentLocked })
  }

  calculateTMTV = () => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { element } = scene.getViewports()[0]
    const labelmapUIDs = SegmentationModule.getLabelmapUIDsForElement(element)

    const labelmaps = labelmapUIDs.map((uid) => cache.getVolume(uid))
    const segmentationIndex = 1
    const tmtv = csToolsUtils.segmentation.calculateTMTV(
      labelmaps,
      segmentationIndex
    )
    this.setState((prevState) => ({
      ...prevState,
      tmtv,
    }))
  }

  calculateSuvPeak = () => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const viewport = scene.getViewports()[0]

    const { uid } = viewport.getDefaultActor()
    const referenceVolume = cache.getVolume(uid)

    const labelmapUIDs = SegmentationModule.getLabelmapUIDsForElement(
      viewport.element
    )

    const labelmaps = labelmapUIDs.map((uid) => cache.getVolume(uid))
    const segmentationIndex = 1
    const suvPeak = csToolsUtils.segmentation.calculateSuvPeak(
      viewport,
      labelmaps[0],
      referenceVolume,
      segmentationIndex
    )
    console.debug('suvPeak', suvPeak)
  }

  setEndSlice = () => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const viewport = scene.getViewports()[0]

    const selectedToolDataList =
      toolDataSelection.getSelectedToolDataByToolName(
        RECTANGLE_ROI_THRESHOLD_MANUAL
      )

    const toolData = selectedToolDataList[0]

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    toolData.data.endSlice = sliceIndex

    viewport.render()
  }

  setStartSlice = () => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const viewport = scene.getViewports()[0]

    const { focalPoint, viewPlaneNormal } = viewport.getCamera()

    const selectedToolDataList =
      toolDataSelection.getSelectedToolDataByToolName(
        RECTANGLE_ROI_THRESHOLD_MANUAL
      )

    const toolData = selectedToolDataList[0]
    const { handles } = toolData.data
    const { points } = handles

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    toolData.data.startSlice = sliceIndex

    // distance between camera focal point and each point on the rectangle
    const newPoints = points.map((point) => {
      const distance = vec3.create()
      vec3.subtract(distance, focalPoint, point)
      // distance in the direction of the viewPlaneNormal
      const distanceInViewPlane = vec3.dot(distance, viewPlaneNormal)
      // new point is current point minus distanceInViewPlane
      const newPoint = vec3.create()
      vec3.scaleAndAdd(newPoint, point, viewPlaneNormal, distanceInViewPlane)

      return newPoint
      //
    })

    handles.points = newPoints
    viewport.render()
  }

  executeThresholding = (mode, activeTool) => {
    const ptVolume = cache.getVolume(ptVolumeUID)
    const labelmapVolume = cache.getVolume(this.state.selectedLabelmapUID)
    const numSlices = this.state.numSlicesForThreshold
    const selectedToolDataList =
      toolDataSelection.getSelectedToolDataByToolName(activeTool)

    let slices
    if (activeTool === RECTANGLE_ROI_THRESHOLD_MANUAL) {
      const data = selectedToolDataList[0].data
      slices = {
        sliceNumbers: [data.startSlice, data.endSlice],
      }
    } else {
      slices = {
        numSlices,
      }
    }

    if (mode === 'max') {
      csToolsUtils.segmentation.thresholdVolumeByRoiStats(
        selectedToolDataList,
        [ptVolume],
        labelmapVolume,
        {
          statistic: 'max',
          weight: 0.41,
          slices,
          overwrite: true,
        }
      )

      return
    }

    csToolsUtils.segmentation.thresholdVolumeByRange(
      selectedToolDataList,
      [ptVolume],
      labelmapVolume,
      {
        lowerThreshold: Number(this.state.thresholdMin),
        higherThreshold: Number(this.state.thresholdMax),
        slices,
        overwrite: true,
      }
    )

    /* const toolGroup = this.state.toolGroups[this.state.toolGroupName]
    const tool = toolGroup.getToolInstance(RECTANGLE_ROI_THRESHOLD)
    tool.execute(options) */
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

  hidOffScreenCanvas = () => {
    // remove all children
    this._offScreenRef.current.innerHTML = ''
  }

  getThresholdUID = () => {
    return (
      <>
        {this.getScissorsUI()}

        {this.state.ptCtLeftClickTool === RECTANGLE_ROI_THRESHOLD ? (
          <>
            <label htmlFor="numSlices" style={{ marginLeft: '5px' }}>
              Number of Slices (+/-)
            </label>
            <input
              type="number"
              style={{ marginLeft: '5px' }}
              name="numSlices"
              value={this.state.numSlicesForThreshold}
              onChange={(evt) => {
                this.setState({
                  numSlicesForThreshold: Number(evt.target.value),
                })
              }}
            />
          </>
        ) : (
          <>
            <button onClick={() => this.setStartSlice()}>
              Set Start Slice
            </button>
            <button onClick={() => this.setEndSlice()}>Set End Slice</button>
          </>
        )}
        <label htmlFor="thresholdMin" style={{ marginLeft: '5px' }}>
          Min value
        </label>
        <input
          type="number"
          style={{ marginLeft: '5px' }}
          name="thresholdMin"
          value={this.state.thresholdMin}
          onChange={(evt) => {
            this.setState({ thresholdMin: evt.target.value })
          }}
        />
        <label htmlFor="thresholdMax" style={{ marginLeft: '5px' }}>
          Max value
        </label>
        <input
          type="number"
          style={{ marginLeft: '5px' }}
          name="thresholdMax"
          value={this.state.thresholdMax}
          onChange={(evt) => {
            this.setState({ thresholdMax: evt.target.value })
          }}
        />
        <button
          style={{ marginLeft: '5px' }}
          onClick={() =>
            this.executeThresholding('', this.state.ptCtLeftClickTool)
          }
        >
          Execute Range Thresholding on Selected Annotation
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() =>
            this.executeThresholding('max', this.state.ptCtLeftClickTool)
          }
        >
          Execute Max Thresholding on Selected Annotation
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.calculateTMTV()}
        >
          Calculate TMTV
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.calculateSuvPeak()}
        >
          Calculate SUV Peak
        </button>
        {this.state.tmtv !== null && (
          <span>{`    TMTV: ${this.state.tmtv.toFixed(2)} ml`}</span>
        )}
      </>
    )
  }

  getScissorsUI = () => {
    return (
      <>
        <button
          onClick={() =>
            this.createNewLabelmapForScissors({
              target: { value: this.state.sceneForSegmentation },
            })
          }
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Create New Labelmap
        </button>
      </>
    )
  }

  deleteLabelmap = () => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { element } = scene.getViewports()[0]
    const labelmapUID = this.state.selectedLabelmapUID

    const removeFromCache = true
    // SegmentationModule.removeLabelmapForElement(element, labelmapUID, removeFromCache)
    SegmentationModule.removeLabelmapForAllElements(
      labelmapUID,
      removeFromCache
    )

    this.renderingEngine.render()
  }

  hideSegmentation = (segmentUID) => {
    const sceneUID = this.state.sceneForSegmentation
    const scene = this.renderingEngine.getScene(sceneUID)
    const { element } = scene.getViewports()[0]
    hideSegmentController.toggleSegmentationVisibility(element, segmentUID)
  }

  getToolStrategyUI = () => {
    const toolGroup = this.state.toolGroups[this.state.toolGroupName]
    if (!toolGroup) {
      return null
    }
    const toolInstance = toolGroup._toolInstances[this.state.ptCtLeftClickTool]

    if (!toolInstance) {
      return
    }

    const strategies = Object.keys(toolInstance.configuration.strategies)
    return (
      <>
        {strategies.map((strategyName) => (
          <option key={strategyName} value={strategyName}>
            {strategyName}
          </option>
        ))}
      </>
    )
  }

  getSetToolModes = () => {
    return (
      <>
        <span>Set this tool </span>
        <select
          value={this.state.ptCtLeftClickTool}
          onChange={(evt) => {
            const toolName = evt.target.value
            if (SEGMENTATION_TOOLS.includes(toolName)) {
              this.setState({ segmentationToolActive: true })
            }
            this.setState({ ptCtLeftClickTool: toolName })
          }}
        >
          {toolsToUse.map((toolName) => (
            <option key={toolName} value={toolName}>
              {toolName}
            </option>
          ))}
        </select>
        <span> Strategies </span>
        <select
          value={this.state.selectedStrategy}
          style={{ minWidth: '50px', margin: '0px 4px' }}
          onChange={(evt) => {
            const activeStrategy = evt.target.value
            const toolGroup = this.state.toolGroups[this.state.toolGroupName]

            toolGroup._toolInstances[
              this.state.ptCtLeftClickTool
            ].setActiveStrategy(activeStrategy)

            toolGroup.resetViewportsCursor(
              { name: this.state.ptCtLeftClickTool },
              activeStrategy
            )
            this.setState({ selectedStrategy: activeStrategy })
          }}
        >
          {this.getToolStrategyUI()}
        </select>
        <span style={{ marginLeft: '4px' }}>for this toolGroup </span>
        <select
          value={this.state.toolGroupName}
          onChange={(evt) => {
            const sceneUID = evt.target.value
            const scene = this.renderingEngine.getScene(sceneUID)
            const { uid, element } = scene.getViewports()[0]
            const labelmapUIDs =
              SegmentationModule.getLabelmapUIDsForElement(element)
            const index = segmentIndexController.getActiveSegmentIndex(element)
            const segmentLocked =
              lockedSegmentController.getSegmentIndexLockedStatusForElement(
                element,
                index
              )

            console.debug('setting tool group name of ', sceneUID)
            this.setState({
              sceneForSegmentation: sceneUID,
              availableLabelmaps: labelmapUIDs,
              activeSegmentIndex: index,
              segmentLocked,
              toolGroupName: evt.target.value,
            })
          }}
        >
          {Object.keys(this.state.toolGroups).map((toolGroupName) => (
            <option key={toolGroupName} value={toolGroupName}>
              {toolGroupName}
            </option>
          ))}
        </select>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Active)}
        >
          Active
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Passive)}
        >
          Passive
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Enabled)}
        >
          Enabled
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(ToolModes.Disabled)}
        >
          Disabled
        </button>
      </>
    )
  }

  render() {
    return (
      <div style={{ paddingBottom: '55px' }}>
        <div className="row">
          <div className="col-xs-12" style={{ margin: '8px 0' }}>
            <h2>Segmentation Example ({this.state.progressText})</h2>
            <h4>
              For Segmentation tools, you need to click on "Create New Labelmap"
              button (when the options appear)
            </h4>
            {!window.crossOriginIsolated ? (
              <h1 style={{ color: 'red' }}>
                This Demo requires SharedArrayBuffer but your browser does not
                support it
              </h1>
            ) : null}
          </div>
        </div>

        <div>{this.getSetToolModes()}</div>
        {this.state.segmentationToolActive && (
          <div style={{ marginTop: '15px' }}>
            {this.state.ptCtLeftClickTool.includes(RECTANGLE_ROI_THRESHOLD)
              ? this.getThresholdUID()
              : this.getScissorsUI()}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '5px',
              }}
            >
              <span> Labelmaps (active is selected) </span>
              <select
                value={this.state.selectedLabelmapUID}
                style={{ minWidth: '50px', margin: '0px 8px' }}
                onChange={(evt) => {
                  const selectedLabelmapUID = evt.target.value
                  const scene = this.renderingEngine.getScene(
                    this.state.sceneForSegmentation
                  )
                  const { element } = scene.getViewports()[0]

                  activeLabelmapController.setActiveLabelmapByLabelmapUID(
                    element,
                    selectedLabelmapUID
                  )

                  const activeSegmentIndex =
                    segmentIndexController.getActiveSegmentIndex(element)

                  this.setState({
                    selectedLabelmapUID,
                    activeSegmentIndex: activeSegmentIndex,
                  })
                }}
                size={3}
              >
                {this.state.availableLabelmaps.map((labelmapUID) => (
                  <option key={labelmapUID} value={labelmapUID}>
                    {labelmapUID}
                  </option>
                ))}
              </select>
              <button
                onClick={() => this.deleteLabelmap()}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Delete Labelmap
              </button>

              <button
                onClick={() => this.changeActiveSegmentIndex(-1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Previous Segment
              </button>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                {`Active Segment Index ${this.state.activeSegmentIndex}`}
                <div>
                  <input
                    type="checkbox"
                    style={{ marginLeft: '0px' }}
                    name="lockToggle"
                    checked={this.state.segmentLocked}
                    onChange={(evt) => this.toggleLockedSegmentIndex(evt)}
                  />
                  <label htmlFor="lockToggle" style={{ marginLeft: '5px' }}>
                    Locked?
                  </label>
                </div>
              </span>
              <button
                onClick={() => this.changeActiveSegmentIndex(1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Next Segment
              </button>
            </div>
          </div>
        )}

        <div>
          <h5>Use Synthetic Segmentation</h5>
          <div>
            <button
              onClick={() => {
                this.setState(
                  { segmentationStatus: 'Calculating...' },
                  this.preLoadSegmentations
                )
              }}
              disabled={this.state.progressText !== 'Loaded.'}
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              1) Pre-compute bone & softTissue and fatTissue labelmaps
            </button>
            <span>{this.state.segmentationStatus}</span>
            {this.state.segmentationStatus !== 'done' ? null : (
              <>
                <button
                  onClick={() =>
                    this.loadSegmentation(
                      this.state.sceneForSegmentation,
                      labelmap1UID
                    )
                  }
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.a) Load Bone & Soft Tissue Labelmap
                </button>
                <button
                  onClick={() =>
                    this.loadSegmentation(
                      this.state.sceneForSegmentation,
                      labelmap2UID
                    )
                  }
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap
                </button>
              </>
            )}
          </div>

          <div>
            <h4>Segmentation Rendering Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutline}
              onChange={() => {
                const renderOutline = !this.state.renderOutline
                SegmentationModule.setGlobalConfig({ renderOutline })
                this.setState({
                  renderOutline,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render Outline
            </label>
            <input
              type="checkbox"
              style={{ marginLeft: '10px' }}
              name="toggle"
              defaultChecked={this.state.renderInactiveLabelmaps}
              onChange={() => {
                const renderInactiveLabelmaps =
                  !this.state.renderInactiveLabelmaps
                SegmentationModule.setGlobalConfig({ renderInactiveLabelmaps })
                this.setState({
                  renderInactiveLabelmaps,
                })
              }}
            />
            <label htmlFor="toggle" style={{ marginLeft: '5px' }}>
              Render inactive Labelmaps
            </label>
            <div style={{ display: 'flex' }}>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlpha">fillAlpha</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlpha"
                  name="fillAlpha"
                  value={this.state.fillAlpha}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = Number(evt.target.value)
                    this.setState({ fillAlpha })
                    SegmentationModule.setGlobalConfig({ fillAlpha })
                  }}
                />
              </div>
              <div style={{ display: 'flex' }}>
                <label htmlFor="fillAlphaInactive">fillAlphaInactive</label>
                <input
                  style={{ maxWidth: '60%', marginLeft: '5px' }}
                  type="range"
                  id="fillAlphaInactive"
                  name="fillAlphaInactive"
                  value={this.state.fillAlphaInactive}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = Number(evt.target.value)
                    this.setState({ fillAlphaInactive })
                    SegmentationModule.setGlobalConfig({ fillAlphaInactive })
                  }}
                />
              </div>
              <div>
                <button
                  onClick={() =>
                    this.hideSegmentation(this.state.selectedLabelmapUID)
                  }
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  Hide Segment
                </button>
                <button
                  onClick={() => this.hideSegmentation()}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  Hide All Segments
                </button>
              </div>
            </div>
          </div>
        </div>
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
            onClick={this.hidOffScreenCanvas}
            className="btn btn-primary"
            style={{ margin: '2px 4px' }}
          >
            Hide OffScreenCanvas
          </button>
          <div ref={this._offScreenRef}></div>
        </div>
      </div>
    )
  }
}

export default SegmentationExample
