import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  ArrowAnnotateTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'VOLUME_SLICE_TOOL_GROUP';
const volumeName = 'CT_VOLUME_ID';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';
const volumeId = `${volumeLoaderScheme}:${volumeName}`;

const viewportIds = {
  axial: 'AXIAL_SLICE',
  sagittal: 'SAGITTAL_SLICE',
  coronal: 'CORONAL_SLICE',
};

setTitleAndDescription(
  'Legacy Volume Viewport with Tools',
  'Displays axial, sagittal, and coronal volume viewports using the legacy VolumeMapper with annotation and manipulation tools.'
);

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  ArrowAnnotateTool.toolName,
  WindowLevelTool.toolName,
];

let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });

    toolGroup.setToolPassive(selectedToolName);
    selectedToolName = newSelectedToolName;
  },
});

const content = document.getElementById('content');
const container = document.createElement('div');
container.style.display = 'grid';
container.style.gridTemplateColumns = 'repeat(3, 1fr)';
container.style.gap = '5px';
container.style.width = '100%';
container.style.height = '500px';

const axialElement = document.createElement('div');
axialElement.id = 'axial-element';
axialElement.style.width = '100%';
axialElement.style.height = '100%';
axialElement.oncontextmenu = () => false;

const sagittalElement = document.createElement('div');
sagittalElement.id = 'sagittal-element';
sagittalElement.style.width = '100%';
sagittalElement.style.height = '100%';
sagittalElement.oncontextmenu = () => false;

const coronalElement = document.createElement('div');
coronalElement.id = 'coronal-element';
coronalElement.style.width = '100%';
coronalElement.style.height = '100%';
coronalElement.oncontextmenu = () => false;

container.appendChild(axialElement);
container.appendChild(sagittalElement);
container.appendChild(coronalElement);
content.appendChild(container);

const instructions = document.createElement('p');
instructions.innerText = `Left Click: Selected tool from dropdown
Middle Click: Pan
Right Click: Zoom
Mouse Wheel: Scroll through slices`;
content.appendChild(instructions);

const benchmarkOutput = document.createElement('pre');
benchmarkOutput.style.marginTop = '10px';
benchmarkOutput.style.padding = '8px';
benchmarkOutput.style.background = 'rgba(0, 0, 0, 0.05)';
benchmarkOutput.style.borderRadius = '4px';
benchmarkOutput.style.whiteSpace = 'pre-wrap';
benchmarkOutput.style.fontFamily = 'monospace';
benchmarkOutput.textContent = 'Benchmark idle.';
content.appendChild(benchmarkOutput);

const benchmarkState = {
  running: false,
  cancelled: false,
};

let startBenchmark: (() => void) | null = null;

const runBenchmarkButton = addButtonToToolbar({
  title: 'Run Benchmark',
  onClick: () => startBenchmark?.(),
});

const stopBenchmarkButton = addButtonToToolbar({
  title: 'Stop Benchmark',
  onClick: () => {
    benchmarkState.cancelled = true;
  },
});

stopBenchmarkButton.disabled = true;

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function getPercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentile) - 1)
  );
  return sorted[index];
}

function computeStats(samples: number[]) {
  if (samples.length === 0) {
    return null;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const avg = total / samples.length;

  return {
    count: samples.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: getPercentile(sorted, 0.95),
    p99: getPercentile(sorted, 0.99),
    fps: 1000 / avg,
  };
}

function formatStats(label: string, stats: ReturnType<typeof computeStats>) {
  if (!stats) {
    return `${label}: No samples collected.`;
  }

  return [
    `${label}`,
    `  samples: ${stats.count}`,
    `  avg: ${formatMs(stats.avg)} (${stats.fps.toFixed(1)} fps)`,
    `  median: ${formatMs(stats.median)}`,
    `  p95: ${formatMs(stats.p95)}`,
    `  p99: ${formatMs(stats.p99)}`,
    `  min: ${formatMs(stats.min)}`,
    `  max: ${formatMs(stats.max)}`,
  ].join('\n');
}

function waitForImageRendered(element: HTMLDivElement): Promise<CustomEvent> {
  return new Promise((resolve) => {
    const handler = (evt: Event) => {
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, handler);
      resolve(evt as CustomEvent);
    };
    element.addEventListener(Enums.Events.IMAGE_RENDERED, handler);
  });
}

async function run() {
  await initDemo({
    core: {
      rendering: {
        renderingEngineMode: Enums.RenderingEngineModeEnum.ContextPool,
      },
    },
  });

  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary,
      },
    ],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel,
      },
    ],
  });

  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(CircleROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);
  toolGroup.setToolPassive(WindowLevelTool.toolName);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputs = [
    {
      viewportId: viewportIds.axial,
      type: ViewportType.ORTHOGRAPHIC,
      element: axialElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.sagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: sagittalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
    {
      viewportId: viewportIds.coronal,
      type: ViewportType.ORTHOGRAPHIC,
      element: coronalElement,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0] as Types.Point3,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputs);

  Object.values(viewportIds).forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    Object.values(viewportIds)
  );

  renderingEngine.renderViewports(Object.values(viewportIds));

  startBenchmark = async () => {
    if (benchmarkState.running) {
      return;
    }

    benchmarkState.running = true;
    benchmarkState.cancelled = false;
    runBenchmarkButton.disabled = true;
    stopBenchmarkButton.disabled = false;

    const viewportElements: Record<string, HTMLDivElement> = {
      [viewportIds.axial]: axialElement,
      [viewportIds.sagittal]: sagittalElement,
      [viewportIds.coronal]: coronalElement,
    };

    const benchmarkStart = performance.now();
    const results: string[] = [];

    const BENCHMARK_SAMPLE_COUNT = 120;
    const BENCHMARK_WARMUP_COUNT = 5;

    for (const viewportId of Object.values(viewportIds)) {
      if (benchmarkState.cancelled) {
        break;
      }

      const viewport = renderingEngine.getViewport(
        viewportId
      ) as Types.IVolumeViewport;
      const numberOfSlices = viewport.getNumberOfSlices();

      if (!numberOfSlices) {
        results.push(`${viewportId}: No slices available.`);
        continue;
      }

      const sampleCount = Math.min(numberOfSlices, BENCHMARK_SAMPLE_COUNT);
      const indices =
        sampleCount <= 1
          ? [0]
          : Array.from({ length: sampleCount }, (_, index) =>
              Math.round((index * (numberOfSlices - 1)) / (sampleCount - 1))
            );

      const warmupCount = Math.min(
        BENCHMARK_WARMUP_COUNT,
        Math.max(0, indices.length - 1)
      );
      const samples: number[] = [];

      for (let i = 0; i < indices.length; i++) {
        if (benchmarkState.cancelled) {
          break;
        }

        const imageIndex = indices[i];
        const renderPromise = waitForImageRendered(
          viewportElements[viewportId]
        );
        const start = performance.now();
        await utilities.jumpToSlice(viewportElements[viewportId], {
          imageIndex,
        });
        await renderPromise;
        const elapsed = performance.now() - start;

        if (i >= warmupCount) {
          samples.push(elapsed);
        }

        if ((i + 1) % 10 === 0 || i === indices.length - 1) {
          benchmarkOutput.textContent = `Benchmark running...\n${viewportId}: ${
            i + 1
          }/${indices.length}`;
        }
      }

      const stats = computeStats(samples);
      results.push(
        formatStats(
          `${viewportId} (slices: ${numberOfSlices}, sampled: ${sampleCount}, warmup: ${warmupCount})`,
          stats
        )
      );
    }

    const durationMs = performance.now() - benchmarkStart;
    const header = benchmarkState.cancelled
      ? `Benchmark cancelled after ${formatMs(durationMs)}.`
      : `Benchmark complete in ${formatMs(durationMs)}.`;
    benchmarkOutput.textContent = [header, ...results].join('\n\n');

    benchmarkState.running = false;
    benchmarkState.cancelled = false;
    runBenchmarkButton.disabled = false;
    stopBenchmarkButton.disabled = true;
  };
}

run();
