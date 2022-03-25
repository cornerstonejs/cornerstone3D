import React, { Component } from 'react'

import { vec3 } from 'gl-matrix'

import {
  cache,
  RenderingEngine,
  volumeLoader,
  init as cs3dInit,
  eventTarget,
} from '@cornerstonejs/core'
import {
  // Segmentation
  synchronizers,
  Enums as csToolsEnums,
  annotation,
  utilities as csToolsUtils,
  segmentation,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  RectangleRoiTool,
} from '@cornerstonejs/tools'
import * as csTools3d from '@cornerstonejs/tools'
import '@cornerstonejs/streaming-image-volume-loader' // for loader to get registered

import getImageIds from './helpers/getImageIds'
import ViewportGrid from './components/ViewportGrid'
import { initToolGroups, addToolsToToolGroups } from './initToolGroups'
import './ExampleVTKMPR.css'
import {
  renderingEngineId,
  ptVolumeId,
  ctVolumeId,
  colormaps,
  ANNOTATION_TOOLS,
  SEGMENTATION_TOOLS,
  VIEWPORT_IDS,
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
  ptCtLayoutTools,
  ctAxialSagittalSegmentationToolGroup,
  ptCoronalSegmentationToolGroup,
  axialPTCTSegmentationToolGroup

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers

const { selection } = annotation

const toolsToUse = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  ...ANNOTATION_TOOLS,
  ...SEGMENTATION_TOOLS,
]
const labelmap1UID = 'boneAndSoftTissue'
const labelmap2UID = 'fatTissue'
const RECTANGLE_ROI_THRESHOLD = 'RectangleRoiThreshold'
const RECTANGLE_ROI_THRESHOLD_MANUAL = 'RectangleRoiStartEndThreshold'

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
  ctVolumeId = null
  ptVolumeId = null

  state = {
    progressText: 'fetching metadata...',
    metadataLoaded: false,
    petColorMapIndex: 0,
    layoutIndex: 0,
    destroyed: false,
    // segmentation state
    renderOutlineGlobal: true,
    renderOutlineToolGroup: true,
    renderInactiveSegmentationsGlobal: true,
    renderInactiveSegmentationsToolGroup: true,
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
    ptCtLeftClickTool: WindowLevelTool.toolName,
    ctWindowLevelDisplay: { ww: 0, wc: 0 },
    ptThresholdDisplay: 5,
    // Segmentation
    segmentationStatus: '',
    segmentationToolActive: false,
    selectedsegmentationUID: '',
    availableSegmentations: [],
    fillAlphaGlobal: 0.9,
    fillAlphaToolGroup: 0.9,
    fillAlphaInactiveGlobal: 0.8,
    fillAlphaInactiveToolGroup: 0.8,
    segmentLocked: false,
    thresholdMin: 0,
    thresholdMax: 100,
    numSlicesForThreshold: 1,
    chosenToolStrategy: '',
    // toolGroup
    toolGroups: {},
    selectedToolGroupName: '',
    selectedToolGroupSegmentationDataUIDs: [],
    // all segmentations
    allSegmentationUIDs: [],
    selectedSegmentationUIDFromAll: '',
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
    await cs3dInit()
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
    } = initToolGroups())

    this.ctVolumeId = ctVolumeId
    this.ptVolumeId = ptVolumeId

    const renderingEngine = new RenderingEngine(renderingEngineId)

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
    })

    // Create volumes
    const ptImageIds = await this.petVolumeImageIds
    const ctVolumeImageIds = await this.ctVolumeImageIds

    // This only creates the volumes, it does not actually load all
    // of the pixel data (yet)
    const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
      imageIds: ptImageIds,
    })
    const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
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
      ctVolumeId,
      ptVolumeId,
      colormaps[this.state.petColorMapIndex]
    )

    // Set initial CT levels in UI
    const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0]

    this.setState({
      metadataLoaded: true,
      ctWindowLevelDisplay: { ww: windowWidth, wc: windowCenter },
      toolGroups: {
        ctSceneToolGroup,
        ptSceneToolGroup,
      },
      selectedToolGroupName: 'ctSceneToolGroup',
    })

    // This will initialize volumes in GPU memory
    renderingEngine.render()
    // Start listening for resiz
    this.viewportGridResizeObserver.observe(this._viewportGridRef.current)
  }

  componentDidUpdate(prevProps, prevState) {
    const { layoutIndex } = this.state
    this._removeEventListeners()
    this._addEventListeners()
  }

  _removeEventListeners() {
    eventTarget.removeEventListener(
      csToolsEnums.Events.SEGMENTATION_STATE_MODIFIED,
      this.onSegmentationStateModified
    )

    eventTarget.removeEventListener(
      csToolsEnums.Events.SEGMENTATION_GLOBAL_STATE_MODIFIED,
      this.onGlobalSegmentationStateUpdated
    )

    eventTarget.removeEventListener(
      csToolsEnums.Events.SEGMENTATION_REMOVED,
      this.onSegmentationRemoved
    )
  }

  _addEventListeners() {
    eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_STATE_MODIFIED,
      this.onSegmentationStateModified
    )

    eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_GLOBAL_STATE_MODIFIED,
      this.onGlobalSegmentationStateUpdated
    )

    eventTarget.addEventListener(
      csToolsEnums.Events.SEGMENTATION_REMOVED,
      this.onSegmentationRemoved
    )
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

  onGlobalSegmentationStateUpdated = (evt) => {
    const { segmentationId } = evt.detail
    const allSegmentationUIDs = segmentation.state
      .getGlobalSegmentationState()
      .map(({ volumeId }) => volumeId)

    let newSelectedSegmentationUID = this.state.selectedSegmentationUIDFromAll
    if (newSelectedSegmentationUID === '') {
      newSelectedSegmentationUID = allSegmentationUIDs[0]
    }

    this.setState({
      allSegmentationUIDs: allSegmentationUIDs,
      selectedSegmentationUIDFromAll: newSelectedSegmentationUID,
    })
  }

  onSegmentationStateModified = (evt) => {
    const { toolGroupId } = evt.detail

    if (toolGroupId !== this.state.selectedToolGroupName) {
      return
    }

    const activeSegmentationInfo =
      segmentation.activeSegmentation.getActiveSegmentationInfo(toolGroupId)

    let selectedsegmentationUID, segmentLocked, activeSegmentIndex

    if (activeSegmentationInfo) {
      activeSegmentIndex = activeSegmentationInfo.activeSegmentIndex
      selectedsegmentationUID = activeSegmentationInfo.segmentationDataUID

      segmentLocked =
        segmentation.segmentLocking.getSegmentIndexLockedForSegmentation(
          activeSegmentationInfo.volumeId,
          activeSegmentIndex
        )
    }

    const toolGroupSegmentations =
      segmentation.state.getSegmentationState(toolGroupId)

    let segmentationDataUIDs

    if (toolGroupSegmentations) {
      segmentationDataUIDs = toolGroupSegmentations.map(
        (segData) => segData.segmentationDataUID
      )
    }

    this.setState({
      selectedToolGroupSegmentationDataUIDs: segmentationDataUIDs,
      selectedsegmentationUID: selectedsegmentationUID,
      selectedViewportActiveSegmentIndex: activeSegmentIndex ?? 1,
      segmentLocked: segmentLocked ?? false,
    })
  }

  onSegmentationRemoved = (evt) => {
    const { element } = evt.detail

    const segmentationUIDs =
      segmentation.state.getsegmentationUIDsForElement(element)
    const activesegmentationUID =
      segmentation.activeSegmentation.getActivesegmentationUID(element)
    this.setState({
      availableSegmentations: segmentationUIDs,
      selectedsegmentationUID: activesegmentationUID,
    })
  }

  createNewLabelmapForScissors = async () => {
    const toolGroup = this.state.toolGroups[this.state.selectedToolGroupName]

    const { viewportsInfo } = toolGroup
    const { viewportId, renderingEngineId } = viewportsInfo[0]
    const viewport = this.renderingEngine.getViewport(viewportId)

    segmentation
      .createNewSegmentationForToolGroup(this.state.selectedToolGroupName)
      .then((segmentationId) => {
        segmentation.addSegmentationsForToolGroup(
          this.state.selectedToolGroupName,
          [
            {
              volumeId: segmentationId,
              // default representation which is labelmap
            },
          ]
        )
      })
  }

  setToolMode = (toolMode) => {
    const toolName = this.state.ptCtLeftClickTool

    const toolGroups = this.state.toolGroups

    if (SEGMENTATION_TOOLS.includes(toolName)) {
      this.setState({ segmentationToolActive: true })
    }
    const toolGroup = toolGroups[this.state.selectedToolGroupName]
    if (toolMode === csToolsEnums.ToolModes.Active) {
      const activeTool = toolGroup.getActivePrimaryMouseButtonTool()
      if (activeTool) {
        toolGroup.setToolPassive(activeTool)
      }

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
      })
    } else if (toolMode === csToolsEnums.ToolModes.Passive) {
      toolGroup.setToolPassive(toolName)
    } else if (toolMode === csToolsEnums.ToolModes.Enabled) {
      toolGroup.setToolEnabled(toolName)
    } else if (toolMode === csToolsEnums.ToolModes.Disabled) {
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
    const { imageData: backgroundImageData } = ctViewport.getImageData()

    await volumeLoader.createAndCacheDerivedVolume(ctVolumeId, {
      volumeId: labelmap1UID,
    })
    await volumeLoader.createAndCacheDerivedVolume(ctVolumeId, {
      volumeId: labelmap2UID,
    })

    const boneSoftVolume = cache.getVolume(labelmap1UID)
    const fatVolume = cache.getVolume(labelmap2UID)

    // Bone & soft tissue labelmap
    this.fillBlobForThreshold(boneSoftVolume.imageData, backgroundImageData, [
      'bone',
      'softTissue',
    ])

    // fat tissue labelmap
    this.fillBlobForThreshold(fatVolume.imageData, backgroundImageData, [
      'fatTissue',
    ])

    this.setState({ segmentationStatus: 'done' })
  }

  loadSegmentation = async (segmentationId, initialConfig) => {
    const toolGroupId = this.state.selectedToolGroupName

    if (!initialConfig) {
      await segmentation.addSegmentationsForToolGroup(toolGroupId, [
        {
          volumeId: segmentationId,
          active: true,
          representation: {
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
          },
        },
      ])
    } else {
      await segmentation.addSegmentationsForToolGroup(
        toolGroupId,
        [
          {
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            representation: {},
            active: true,
          },
        ],
        {
          representations: {
            [csToolsEnums.SegmentationRepresentations.Labelmap]: {
              renderOutline: false,
            },
          },
        }
      )
    }

    this.setState({
      segmentationToolActive: true,
    })
  }

  toggleLockedSegmentIndex = (evt) => {
    const checked = evt.target.checked

    const activesegmentationInfo =
      segmentation.activeSegmentation.getActiveSegmentationInfo(
        this.state.selectedToolGroupName
      )

    const { volumeId, activeSegmentIndex } = activesegmentationInfo

    const activeSegmentLockedStatus =
      segmentation.segmentLocking.getSegmentIndexLockedForSegmentation(
        volumeId,
        activeSegmentIndex
      )

    segmentation.segmentLocking.setSegmentIndexLockedForSegmentation(
      volumeId,
      activeSegmentIndex,
      !activeSegmentLockedStatus
    )

    this.setState({ segmentLocked: !activeSegmentLockedStatus })
  }

  changeActiveSegmentIndex = (direction) => {
    const toolGroupId = this.state.selectedToolGroupName
    const activeSegmentationInfo =
      segmentation.activeSegmentation.getActiveSegmentationInfo(toolGroupId)

    const { activeSegmentIndex } = activeSegmentationInfo
    let newIndex = activeSegmentIndex + direction

    if (newIndex < 0) {
      newIndex = 0
    }

    segmentation.segmentIndex.setActiveSegmentIndex(toolGroupId, newIndex)

    const segmentIsLocked = segmentation.segmentLocking.getSegmentIndexLocked(
      toolGroupId,
      newIndex
    )

    this.setState({
      selectedViewportActiveSegmentIndex: newIndex,
      segmentLocked: segmentIsLocked,
    })
  }

  calculateTMTV = () => {
    const viewportId = this.state.selectedToolGroupName
    const { element } = this.renderingEngine.getViewport(viewportId)
    const segmentationUIDs = segmentation.getsegmentationUIDsForElement(element)

    const labelmaps = segmentationUIDs.map((uid) => cache.getVolume(uid))
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
    const viewportId = this.state.selectedToolGroupName
    const viewport = this.renderingEngine.getViewport(viewportId)

    const { uid } = viewport.getDefaultActor()
    const referenceVolume = cache.getVolume(uid)

    const segmentationUIDs = segmentation.getsegmentationUIDsForElement(
      viewport.element
    )

    const labelmaps = segmentationUIDs.map((uid) => cache.getVolume(uid))
    const segmentationIndex = 1
    const suvPeak = csToolsUtils.segmentation.calculateSuvPeak(
      viewport,
      labelmaps[0],
      referenceVolume
    )
    console.debug('suvPeak', suvPeak)
  }

  setEndSlice = () => {
    if (this.state.ptCtLeftClickTool !== RECTANGLE_ROI_THRESHOLD_MANUAL) {
      throw new Error('cannot apply start slice')
    }

    let annotation = selection.getAnnotationsSelectedByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!annotation) {
      throw new Error('No annotation selected ')
    }

    annotation = annotation[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = annotation // assuming they are all overlayed on the same toolGroup

    const volumeActorInfo = viewport.getDefaultActor()

    // Todo: this only works for volumeViewport
    const { uid } = volumeActorInfo

    const segmentationData = SegmentatoinState.getSegmentationDataByUID(
      this.state.selectedToolGroupName,
      this.state.selectedsegmentationUID
    )
    const globalState = segmentation.state.getSegmentation(
      segmentationData.volumeId
    )

    if (!globalState) {
      throw new Error('No Segmentation Found')
    }

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    annotation.data.endSlice = sliceIndex
    annotation.data.invalidated = true // IMPORTANT: invalidate the annotation for the cached stat to get updated

    viewport.render()
  }

  setStartSlice = () => {
    if (this.state.ptCtLeftClickTool !== RECTANGLE_ROI_THRESHOLD_MANUAL) {
      throw new Error('cannot apply start slice')
    }

    let annotation = selection.getAnnotationsSelectedByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!annotation) {
      throw new Error('No annotation selected ')
    }

    annotation = annotation[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = annotation // assuming they are all overlayed on the same toolGroup

    const { focalPoint, viewPlaneNormal } = viewport.getCamera()

    const selectedAnnotations = selection.getAnnotationsSelectedByToolName(
      this.state.ptCtLeftClickTool
    )

    const { handles } = annotation.data
    const { points } = handles

    // get the current slice Index
    const sliceIndex = viewport.getCurrentImageIdIndex()
    annotation.data.startSlice = sliceIndex

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
    annotation.data.invalidated = true // IMPORTANT: invalidate the annotation for the cached stat to get updated
    viewport.render()
  }

  executeThresholding = (mode) => {
    let annotation = selection.getAnnotationsSelectedByToolName(
      this.state.ptCtLeftClickTool
    )

    if (!annotation) {
      throw new Error('No annotation selected ')
    }

    annotation = annotation[0]

    const {
      metadata: {
        enabledElement: { viewport },
      },
    } = annotation // assuming they are all overlayed on the same toolGroup

    const volumeActorInfo = viewport.getDefaultActor()

    // Todo: this only works for volumeViewport
    const { uid } = volumeActorInfo
    const referenceVolume = cache.getVolume(uid)

    const segmentationData = SegmentatoinState.getSegmentationDataByUID(
      this.state.selectedToolGroupName,
      this.state.selectedsegmentationUID
    )

    const numSlices = this.state.numSlicesForThreshold
    const selectedAnnotations = selection.getAnnotationsSelectedByToolName(
      this.state.ptCtLeftClickTool
    )

    if (mode === 'max') {
      csToolsUtils.segmentation.thresholdVolumeByRoiStats(
        this.state.selectedToolGroupName,
        selectedAnnotations,
        [referenceVolume],
        segmentationData,
        {
          statistic: 'max',
          weight: 0.41,
          numSlicesToProject: numSlices,
          overwrite: false,
        }
      )

      return
    }

    csToolsUtils.segmentation.thresholdVolumeByRange(
      this.state.selectedToolGroupName,
      selectedAnnotations,
      [referenceVolume],
      segmentationData,
      {
        lowerThreshold: Number(this.state.thresholdMin),
        higherThreshold: Number(this.state.thresholdMax),
        numSlicesToProject: numSlices,
        overwrite: false,
      }
    )
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
          onClick={() => this.executeThresholding('')}
        >
          Execute Range Thresholding on Selected Annotation
        </button>
        <button
          style={{ marginLeft: '5px' }}
          onClick={() => this.executeThresholding('max')}
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
          onClick={() => this.createNewLabelmapForScissors()}
          className="btn btn-primary"
          style={{ margin: '2px 4px' }}
        >
          Create New Segmentation
        </button>
      </>
    )
  }

  deleteSegmentation = () => {
    const segmentationDataUID = this.state.selectedsegmentationUID
    segmentation.removeSegmentationsFromToolGroup(
      this.state.selectedToolGroupName,
      [segmentationDataUID]
    )
  }

  toggleSegmentationVisibility = (segmentDataUID) => {
    const visibilityStatus =
      segmentation.segmentationVisibility.getSegmentationVisibility(
        this.state.selectedToolGroupName,
        segmentDataUID
      )

    segmentation.segmentationVisibility.setSegmentationVisibility(
      this.state.selectedToolGroupName,
      segmentDataUID,
      !visibilityStatus
    )
  }

  hideAllSegmentations = () => {
    this.state.toolGroups[this.state.selectedToolGroupName].setToolDisabled(
      SegmentationDisplayTool.toolName
    )
  }

  showAllSegmentations = () => {
    this.state.toolGroups[this.state.selectedToolGroupName].setToolEnabled(
      SegmentationDisplayTool.toolName
    )
  }

  getToolStrategyUI = () => {
    const toolGroup = this.state.toolGroups[this.state.selectedToolGroupName]
    if (!toolGroup) {
      return null
    }
    const toolInstance = toolGroup.getToolInstance(this.state.ptCtLeftClickTool)

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
          value={this.state.chosenToolStrategy}
          style={{ minWidth: '50px', margin: '0px 4px' }}
          onChange={(evt) => {
            const activeStrategy = evt.target.value
            const toolGroup =
              this.state.toolGroups[this.state.selectedToolGroupName]

            toolGroup
              .getToolInstance(this.state.ptCtLeftClickTool)
              .setActiveStrategy(activeStrategy)

            toolGroup.setViewportsCursorByToolName(
              this.state.ptCtLeftClickTool,
              activeStrategy
            )
            this.setState({ chosenToolStrategy: activeStrategy })
          }}
        >
          {this.state.toolGroups && this.getToolStrategyUI()}
        </select>
        <span style={{ marginLeft: '4px' }}>for this toolGroup </span>
        <select
          value={this.state.selectedToolGroupName}
          onChange={(evt) => {
            const toolGroupName = evt.target.value
            const toolGroupSegmentations =
              segmentation.state.getSegmentationState(toolGroupName)

            const activeSegmentationData =
              segmentation.activeSegmentation.getActiveSegmentationInfo(
                toolGroupName
              )

            const toolGroupSegmentationConfig =
              segmentation.segmentationConfig.getSegmentationConfig(
                toolGroupName
              )

            this.setState({
              selectedToolGroupName: toolGroupName,
              selectedToolGroupSegmentationDataUIDs: toolGroupSegmentations.map(
                (segData) => segData.segmentationDataUID
              ),
              selectedsegmentationUID:
                activeSegmentationData?.segmentationDataUID,
              renderOutlineToolGroup:
                toolGroupSegmentationConfig?.renderOutline || true,
              renderInactiveSegmentationsToolGroup:
                toolGroupSegmentationConfig?.renderInactiveSegmentations ||
                true,
              fillAlphaToolGroup: toolGroupSegmentationConfig?.fillAlpha || 0.9,
              fillAlphaInactiveToolGroup:
                toolGroupSegmentationConfig?.fillAlphaInactive || true,
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
          onClick={() => this.setToolMode(csToolsEnums.ToolModes.Active)}
        >
          Active
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(csToolsEnums.ToolModes.Passive)}
        >
          Passive
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(csToolsEnums.ToolModes.Enabled)}
        >
          Enabled
        </button>
        <button
          style={{ marginLeft: '4px' }}
          onClick={() => this.setToolMode(csToolsEnums.ToolModes.Disabled)}
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
              For Segmentation tools, you need to click on "Create New
              Segmentation" button (when the options appear)
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
            {this.state.ptCtLeftClickTool.includes(RectangleRoiTool.toolName)
              ? this.getThresholdUID()
              : this.getScissorsUI()}
            <span> All global segmentations </span>
            <select
              value={this.state.selectedSegmentationUIDFromAll}
              style={{ minWidth: '50px', margin: '0px 8px' }}
              onChange={(evt) => {
                this.setState({
                  selectedSegmentationUIDFromAll: evt.target.value,
                })
              }}
              size={3}
            >
              {this.state.allSegmentationUIDs.map((segmentationId) => (
                <option key={`${segmentationId}-all`} value={segmentationId}>
                  {segmentationId}
                </option>
              ))}
            </select>
            <button
              onClick={async () => {
                const toolGroupId = this.state.selectedToolGroupName
                segmentation
                  .addSegmentationsForToolGroup(toolGroupId, [
                    {
                      volumeId: this.state.selectedSegmentationUIDFromAll,
                      // no representation -> labelmap
                    },
                  ])
                  .then(() => {
                    const { volumeId, activeSegmentIndex } =
                      segmentation.activeSegmentation.getActiveSegmentationInfo(
                        toolGroupId
                      )

                    const activeSegmentIndexLocked =
                      segmentation.segmentLocking.getSegmentIndexLockedForSegmentation(
                        volumeId,
                        activeSegmentIndex
                      )

                    this.setState({
                      selectedViewportActiveSegmentIndex: activeSegmentIndex,
                      segmentLocked: activeSegmentIndexLocked,
                    })
                  })
              }}
              className="btn btn-primary"
              style={{ margin: '2px 4px' }}
            >
              Add Segmentation to selected toolGroup
            </button>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: '5px',
              }}
            >
              <span>
                {' '}
                ToolGroup Segmentations (selected is active Segmentation){' '}
              </span>
              <select
                value={this.state.selectedsegmentationUID}
                style={{ minWidth: '150px', margin: '0px 8px' }}
                onChange={(evt) => {
                  const selectedsegmentationUID = evt.target.value

                  segmentation.activeSegmentation.setActiveSegmentation(
                    this.state.selectedToolGroupName,
                    selectedsegmentationUID
                  )

                  this.setState({
                    selectedsegmentationUID,
                  })
                }}
                size={3}
              >
                {this.state.selectedToolGroupSegmentationDataUIDs.map(
                  (segmentationId) => (
                    <option
                      key={`${segmentationId}-viewport`}
                      value={segmentationId}
                    >
                      {segmentationId}
                    </option>
                  )
                )}
              </select>
              <button
                onClick={() => this.deleteSegmentation()}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Delete From ToolGroup
              </button>

              <button
                onClick={() => this.changeActiveSegmentIndex(-1)}
                className="btn btn-primary"
                style={{ margin: '2px 4px' }}
              >
                Previous Segment
              </button>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                {`Active Segment Index ${this.state.selectedViewportActiveSegmentIndex}`}
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
                  onClick={() => this.loadSegmentation(labelmap1UID)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.a) Load Bone & Soft Tissue Labelmap
                </button>
                <button
                  onClick={() => this.loadSegmentation(labelmap2UID)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap
                </button>
                <button
                  onClick={() => this.loadSegmentation(labelmap2UID, true)}
                  className="btn btn-secondary"
                  style={{ margin: '2px 4px' }}
                >
                  2.b) Load Fat Tissue Labelmap With Initial Config
                </button>
              </>
            )}
          </div>

          <div>
            <h4>ToolGroup-specific Labelmap Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutlineToolGroup}
              onChange={() => {
                const renderOutline = !this.state.renderOutlineToolGroup

                this.setState({
                  renderOutlineToolGroup: renderOutline,
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
              defaultChecked={this.state.renderInactiveSegmentationsToolGroup}
              onChange={() => {
                const renderInactiveSegmentations =
                  !this.state.renderInactiveSegmentationsToolGroup

                this.setState({
                  renderInactiveSegmentationsToolGroup:
                    renderInactiveSegmentations,
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
                  value={this.state.fillAlphaToolGroup}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = Number(evt.target.value)
                    const representationType =
                      csToolsEnums.SegmentationRepresentations.Labelmap

                    this.setState({ fillAlphaToolGroup: fillAlpha })
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
                  value={this.state.fillAlphaInactiveToolGroup}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = Number(evt.target.value)
                    this.setState({
                      fillAlphaInactiveToolGroup: fillAlphaInactive,
                    })
                  }}
                />
              </div>
              <button
                onClick={() => {
                  segmentation.segmentationConfig.setSegmentationConfig(
                    this.state.selectedToolGroupName,
                    {
                      renderInactiveSegmentations:
                        this.state.renderInactiveSegmentationsToolGroup,
                      representations: {
                        [csToolsEnums.SegmentationRepresentations.Labelmap]: {
                          renderOutline: this.state.renderOutlineToolGroup,
                          fillAlpha: this.state.fillAlphaToolGroup,
                          fillAlphaInactive:
                            this.state.fillAlphaInactiveToolGroup,
                        },
                      },
                    }
                  )
                }}
              >
                Set Representation Config
              </button>
            </div>
          </div>
          <div>
            <h4>Global Labelmap Config</h4>
            <input
              type="checkbox"
              style={{ marginLeft: '0px' }}
              name="toggle"
              defaultChecked={this.state.renderOutlineGlobal}
              onChange={() => {
                const renderOutline = !this.state.renderOutlineGlobal

                const representationType =
                  csToolsEnums.SegmentationRepresentations.Labelmap
                segmentation.segmentationConfig.updateGlobalRepresentationConfig(
                  representationType,
                  { renderOutline }
                )

                this.setState({
                  renderOutlineGlobal: renderOutline,
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
              defaultChecked={this.state.renderInactiveSegmentationsGlobal}
              onChange={() => {
                const renderInactiveSegmentations =
                  !this.state.renderInactiveSegmentationsGlobal

                segmentation.segmentationConfig.updateGlobalSegmentationConfig({
                  renderInactiveSegmentations,
                })

                this.setState({
                  renderInactiveSegmentationsGlobal:
                    renderInactiveSegmentations,
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
                  value={this.state.fillAlphaGlobal}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlpha = Number(evt.target.value)
                    const representationType =
                      csToolsEnums.SegmentationRepresentations.Labelmap

                    segmentation.segmentationConfig.updateGlobalRepresentationConfig(
                      representationType,
                      {
                        fillAlpha,
                      }
                    )
                    this.setState({ fillAlphaGlobal: fillAlpha })
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
                  value={this.state.fillAlphaInactiveGlobal}
                  min="0.8"
                  max="0.999"
                  step="0.001"
                  onChange={(evt) => {
                    const fillAlphaInactive = Number(evt.target.value)
                    const representationType =
                      csToolsEnums.SegmentationRepresentations.Labelmap

                    segmentation.segmentationConfig.updateGlobalRepresentationConfig(
                      representationType,
                      {
                        fillAlphaInactive,
                      }
                    )
                    this.setState({
                      fillAlphaInactiveGlobal: fillAlphaInactive,
                    })
                  }}
                />
              </div>
            </div>
          </div>
          <div>
            <button
              onClick={() =>
                this.toggleSegmentationVisibility(
                  this.state.selectedsegmentationUID
                )
              }
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Toggle Hide Segmentation For ToolGroup
            </button>
            <button
              onClick={() => this.hideAllSegmentations()}
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Hide All Segmentations For ToolGroup
            </button>
            <button
              onClick={() => this.showAllSegmentations()}
              className="btn btn-secondary"
              style={{ margin: '2px 4px' }}
            >
              Show All Segmentations For ToolGroup
            </button>
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
