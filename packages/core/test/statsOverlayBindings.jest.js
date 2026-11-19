import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { RenderModesPanel } from '../src/RenderingEngine/helpers/stats/RenderModesPanel';
import {
  collectBindingFacts,
  markSharedVolumeTextures,
  summarizeTextureMemory,
} from '../src/RenderingEngine/helpers/stats/collectBindingFacts';

const mockEngines = [];

jest.mock('../src/RenderingEngine/renderingEngineCache', () => ({
  __esModule: true,
  default: { getAll: () => mockEngines },
}));

const MB = 1024 * 1024;

function imageData(width, height, ArrayType) {
  const data = new ArrayType(width * height);

  return {
    getDimensions: () => [width, height, 1],
    getPointData: () => ({
      getScalars: () => ({
        getDataType: () => ArrayType.name,
        getNumberOfComponents: () => 1,
        getData: () => data,
        getRange: () => [0, 1],
      }),
    }),
  };
}

function sampledRendering(volumeId, width, height) {
  const input = imageData(width, height, Int16Array);

  return {
    renderMode: 'vtkSampledSlice',
    imageVolume: { volumeId },
    mapper: { getInputData: () => input },
    actor: { getMapper: () => ({ getInputData: () => input }) },
    getSliceCacheStatistics: () => ({
      hits: 12,
      misses: 3,
      prefetched: 6,
      refined: 0,
      size: 7,
      lastSampleMs: 3.25,
      lastFineSampleMs: undefined,
    }),
  };
}

function volumeSliceRendering(volumeId) {
  return { renderMode: 'vtkVolumeSlice', imageVolume: { volumeId } };
}

function fakeViewport(id, bindings) {
  return {
    id,
    type: 'planar',
    _debug: {
      renderModes: Object.fromEntries(
        bindings.map(({ displaySetId, rendering }) => [
          displaySetId,
          rendering.renderMode,
        ])
      ),
    },
    getActors: () => [],
    getSourceDataId: () => bindings[0]?.displaySetId,
    getDisplaySetRole: (dataId) =>
      bindings.find(({ displaySetId }) => displaySetId === dataId)?.role,
    getDebugBindings: () =>
      bindings.map((binding) => ({
        ...binding,
        renderings: [binding.rendering],
      })),
  };
}

function sampledBinding(overrides = {}) {
  return {
    dataId: 'ct',
    renderMode: 'vtkSampledSlice',
    role: 'source',
    sliceSize: [512, 135],
    sampleMs: 3.25,
    fineSampleMs: undefined,
    sliceCache: { size: 7, hits: 12, misses: 3, prefetched: 6 },
    gpuTextures: [
      {
        kind: 'slice',
        bytes: 512 * 135 * 2,
        dimensions: [512, 135],
        scalarType: 'Int16Array',
        approximate: true,
      },
    ],
    ...overrides,
  };
}

function entry(viewportId, bindings) {
  return {
    renderingEngineId: 'engine',
    viewportId,
    viewportType: 'planar',
    bindings,
  };
}

describe('RenderModesPanel', () => {
  it('shows the slice, sample, cache and GPU rows of a sampled binding and the summary', () => {
    const panel = new RenderModesPanel();

    panel.setContent(
      [
        entry('CT_AXIAL', [sampledBinding()]),
        entry('FUSION', [
          {
            dataId: 'pt',
            renderMode: 'vtkVolumeSlice',
            role: 'overlay',
            gpuTextures: [
              {
                kind: 'volume',
                bytes: 155 * MB,
                volumeId: 'pt-volume',
                sharedBy: 2,
              },
            ],
          },
          {
            dataId: 'cpu',
            renderMode: 'cpuVolume',
            role: 'data',
            gpuTextures: [{ kind: 'canvas', bytes: 0 }],
          },
        ]),
      ],
      {
        volumeTextureBytes: 155 * MB,
        sliceTextureBytes: 512 * 135 * 2,
        sliceTexturesApproximate: true,
      }
    );

    const text = panel.dom.textContent;

    expect(text).toContain('gpu memory');
    expect(text).toContain('3D volumes 155.0 MB, 2D slices about 0.13 MB');
    expect(text).toContain('512 x 135');
    expect(text).toContain('3.3 ms, fine -');
    expect(text).toContain('7 held, 12 hits, 3 misses, 6 prefetched');
    expect(text).toContain('2D slice 512x135 Int16, about 0.13 MB');
    expect(text).toContain('3D volume 155.0 MB, shared by 2 viewports');
    expect(text).toContain('none, drawn on a 2D canvas');
  });

  it('adds no new rows to a binding without the new facts', () => {
    const panel = new RenderModesPanel();

    panel.setContent([
      entry('STACK', [
        { dataId: 'image', renderMode: 'vtkImage', role: 'source' },
      ]),
    ]);

    const text = panel.dom.textContent;

    expect(text).not.toContain('slice cache');
    expect(text).not.toContain('gpu');
    expect(text).not.toContain('sample');
  });

  it('keeps the DOM of a section whose entry did not change', () => {
    const panel = new RenderModesPanel();
    const axial = entry('CT_AXIAL', [sampledBinding()]);
    const sagittal = entry('CT_SAGITTAL', [sampledBinding()]);

    panel.setContent([axial, sagittal]);

    const [axialSection, sagittalSection] = Array.from(
      panel.dom.lastElementChild.children
    );

    panel.setContent([
      axial,
      entry('CT_SAGITTAL', [sampledBinding({ sampleMs: 9 })]),
    ]);

    const [nextAxial, nextSagittal] = Array.from(
      panel.dom.lastElementChild.children
    );

    expect(nextAxial).toBe(axialSection);
    expect(nextSagittal).not.toBe(sagittalSection);
    expect(nextSagittal.textContent).toContain('9.0 ms');
  });
});

describe('collectBindingFacts', () => {
  it('reads the sampled slice, the cache and the textures of each binding', () => {
    const viewport = fakeViewport('FUSION', [
      {
        displaySetId: 'ct',
        role: 'source',
        rendering: sampledRendering('ct-volume', 512, 135),
      },
      {
        displaySetId: 'pt',
        role: 'overlay',
        rendering: volumeSliceRendering('pt-volume'),
      },
      {
        displaySetId: 'cpu',
        role: 'data',
        rendering: { renderMode: 'cpuVolume' },
      },
    ]);
    const facts = collectBindingFacts(viewport, (volumeId) =>
      volumeId === 'pt-volume' ? 10 * MB : 0
    );

    expect(facts.get('ct')).toEqual({
      sampleMs: 3.25,
      fineSampleMs: undefined,
      sliceCache: { size: 7, hits: 12, misses: 3, prefetched: 6 },
      sliceSize: [512, 135],
      gpuTextures: [
        {
          kind: 'slice',
          bytes: 512 * 135 * 2,
          dimensions: [512, 135],
          scalarType: 'Int16Array',
          approximate: true,
        },
      ],
    });
    expect(facts.get('pt')).toEqual({
      gpuTextures: [{ kind: 'volume', bytes: 10 * MB, volumeId: 'pt-volume' }],
    });
    expect(facts.get('cpu')).toEqual({
      gpuTextures: [{ kind: 'canvas', bytes: 0 }],
    });
  });

  it('never throws on a viewport without the accessor or with a broken rendering', () => {
    expect(collectBindingFacts({}, () => 0).size).toBe(0);

    const facts = collectBindingFacts(
      {
        getDebugBindings: () => [
          {
            displaySetId: 'broken',
            rendering: {
              renderMode: 'vtkSampledSlice',
              getSliceCacheStatistics: () => {
                throw new Error('boom');
              },
            },
          },
        ],
      },
      () => 0
    );

    expect(facts.get('broken')).toEqual({});
  });

  it('marks shared volumes and counts each 2D slice once in the summary', () => {
    const entries = [
      entry('A', [
        {
          dataId: 'pt',
          renderMode: 'vtkVolumeSlice',
          role: 'source',
          gpuTextures: [{ kind: 'volume', bytes: MB, volumeId: 'pt-volume' }],
        },
      ]),
      entry('B', [
        {
          dataId: 'pt',
          renderMode: 'vtkVolumeSlice',
          role: 'source',
          gpuTextures: [{ kind: 'volume', bytes: MB, volumeId: 'pt-volume' }],
        },
        sampledBinding(),
      ]),
    ];

    markSharedVolumeTextures(entries);

    expect(entries[0].bindings[0].gpuTextures[0].sharedBy).toBe(2);
    expect(summarizeTextureMemory(entries, MB)).toEqual({
      volumeTextureBytes: MB,
      sliceTextureBytes: 512 * 135 * 2,
      sliceTexturesApproximate: true,
    });
  });
});

describe('StatsOverlay', () => {
  afterEach(() => {
    mockEngines.length = 0;
  });

  it('shows the facts of a viewport of a rendering engine in its bindings panel', () => {
    const {
      StatsOverlay,
    } = require('../src/RenderingEngine/helpers/stats/StatsOverlay');
    const overlay = StatsOverlay.getInstance();

    mockEngines.push({
      id: 'engine',
      hasBeenDestroyed: false,
      getViewports: () => [
        fakeViewport('CT_AXIAL', [
          {
            displaySetId: 'ct',
            role: 'source',
            rendering: sampledRendering('ct-volume', 512, 512),
          },
        ]),
      ],
    });

    overlay.setup();
    overlay.updateRenderModesPanel();

    const text = overlay.dom.textContent;

    overlay.cleanup();

    expect(text).toContain('engine/CT_AXIAL');
    expect(text).toContain('vtkSampledSlice');
    expect(text).toContain('512 x 512');
    expect(text).toContain('2D slice 512x512 Int16, about 0.50 MB');
    expect(text).toContain('3D volumes 0.0 MB, 2D slices about 0.50 MB');
  });
});
