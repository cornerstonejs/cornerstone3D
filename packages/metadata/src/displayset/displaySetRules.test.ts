import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { compiledDisplaySetRules } from './compiledDisplaySetRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { createDisplaySetSplitRules, displaySetRules } from './displaySetRules';
import type { DisplaySetRules } from './displaySetRulesTypes';
import { RuleCompileError } from '../safeFunctions';
import { isVideoInstance } from './isVideoInstance';
import { resolveSplitRuleSet } from './splitRuleSet';
import { BaseDisplaySet } from './BaseDisplaySet';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { DISPLAY_SET_HANDLER_NAMES } from './types';
import type { NaturalizedInstance, SplitRule } from './types';

const CT_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.2';
const MR_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.4';
const US_MULTIFRAME_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.3.1';

function instance(
  overrides: Partial<NaturalizedInstance> = {}
): NaturalizedInstance {
  return {
    SOPClassUID: CT_SOP_CLASS,
    SeriesInstanceUID: 'series-1',
    SOPInstanceUID: `sop-${Math.random()}`,
    Modality: 'CT',
    Rows: 512,
    Columns: 512,
    ...overrides,
  };
}

function ruleIdsFor(instances: NaturalizedInstance[], rules = undefined) {
  return groupInstancesBySplitRules(
    instances,
    rules ?? compiledDisplaySetRules
  ).map((group) => group.matchedRule.id);
}

describe('displaySetRules - the rules as data', () => {
  it('is pure JSON: survives a stringify/parse round trip', () => {
    // The whole point of the raw form is that it can cross a process boundary
    // (server index -> client viewer) as JSON, so it must contain no functions.
    const roundTripped = JSON.parse(JSON.stringify(displaySetRules));

    expect(roundTripped).toEqual(displaySetRules);
  });

  it('compiles the same rules after a JSON round trip', () => {
    const instances = [
      instance({ SOPInstanceUID: 'a', InstanceNumber: 1 }),
      instance({ SOPInstanceUID: 'b', InstanceNumber: 2 }),
    ];

    const overTheWire = createDisplaySetSplitRules(
      JSON.parse(JSON.stringify(displaySetRules))
    );

    const local = groupInstancesBySplitRules(
      instances,
      compiledDisplaySetRules
    );
    const remote = groupInstancesBySplitRules(instances, overTheWire);

    expect(remote.map((g) => g.matchedRule.id)).toEqual(
      local.map((g) => g.matchedRule.id)
    );
    expect(remote.map((g) => g.splitKey)).toEqual(local.map((g) => g.splitKey));
  });

  it('gives the defaults the priorities 1..n, and runs the catch-all last', () => {
    const entries = Object.entries(displaySetRules);
    expect(entries.map(([id, rule]) => [id, rule.priority])).toEqual([
      ['video', 1],
      ['ecg', 2],
      ['wholeslide', 3],
      ['singleImageModality', 4],
      ['multiFrame', 5],
      ['mixedDimensionalityBValue', 6],
      ['volume3d', 7],
      ['defaultImageRule', 8],
      ['segmentation', 9],
      ['rtStructureSet', 10],
      ['parametricMap', 11],
      ['structuredReport', 12],
      ['encapsulatedDocument', 13],
      ['bulkAnnotation', 14],
      ['chart', 15],
      ['unsupported', Number.MAX_SAFE_INTEGER],
    ]);
    expect(
      resolveSplitRuleSet(compiledDisplaySetRules).map((rule) => rule.id)
    ).toEqual(entries.map(([id]) => id));
  });
});

describe('createDisplaySetSplitRules - compiled default behaviour', () => {
  it('routes a multi-slice CT series to volume3d', () => {
    expect(
      ruleIdsFor([
        instance({ SOPInstanceUID: 'a', InstanceNumber: 1 }),
        instance({ SOPInstanceUID: 'b', InstanceNumber: 2 }),
      ])
    ).toEqual(['volume3d']);
  });

  it('routes a single CR image to singleImageModality', () => {
    expect(
      ruleIdsFor([
        instance({
          Modality: 'CR',
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.1',
          SOPInstanceUID: 'cr',
        }),
      ])
    ).toEqual(['singleImageModality']);
  });

  it('gives each instance of a four-view MG series its own display set', () => {
    const groups = groupInstancesBySplitRules(
      ['L CC', 'L MLO', 'R CC', 'R MLO'].map((view, index) =>
        instance({
          Modality: 'MG',
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.1.2',
          SOPInstanceUID: view,
          InstanceNumber: index + 1,
          // Two sizes, as a size-bucket split would see them.
          Rows: index % 2 ? 2048 : 512,
          Columns: index % 2 ? 2048 : 512,
        })
      ),
      compiledDisplaySetRules
    );

    expect(
      groups.map((g) => [g.matchedRule.id, g.instances[0].SOPInstanceUID])
    ).toEqual([
      ['singleImageModality', 'L CC'],
      ['singleImageModality', 'L MLO'],
      ['singleImageModality', 'R CC'],
      ['singleImageModality', 'R MLO'],
    ]);
  });

  const MULTI_FRAME: [string, string, string, boolean][] = [
    ['a US clip', US_MULTIFRAME_SOP_CLASS, 'US', true],
    ['an enhanced CT', '1.2.840.10008.5.1.4.1.1.2.1', 'CT', false],
    ['an Enhanced US Volume', '1.2.840.10008.5.1.4.1.1.6.2', 'US', false],
    [
      'a multi-frame secondary capture',
      '1.2.840.10008.5.1.4.1.1.7.4',
      'OT',
      false,
    ],
  ];
  for (const [name, SOPClassUID, Modality, isClip] of MULTI_FRAME) {
    it(`gives ${name} one display set for each instance`, () => {
      const groups = groupInstancesBySplitRules(
        ['a', 'b'].map((SOPInstanceUID, index) =>
          instance({
            SOPClassUID,
            Modality,
            SOPInstanceUID,
            InstanceNumber: index + 1,
            NumberOfFrames: 30,
          })
        ),
        compiledDisplaySetRules
      );
      expect(groups.map((g) => g.matchedRule.id)).toEqual([
        'multiFrame',
        'multiFrame',
      ]);
      const displaySet = createDisplaySetFromGroup(groups[0]);
      expect(displaySet.isClip).toBe(isClip);
      expect(displaySet.numImageFrames).toBe(30);
    });
  }

  it('splits a mixed-b-value DWI series in two', () => {
    const instances = [
      instance({
        Modality: 'MR',
        SOPClassUID: MR_SOP_CLASS,
        SOPInstanceUID: 'b0',
        InstanceNumber: 1,
        DiffusionBValue: 0,
      }),
      instance({
        Modality: 'MR',
        SOPClassUID: MR_SOP_CLASS,
        SOPInstanceUID: 'b1000',
        InstanceNumber: 2,
        DiffusionBValue: 1000,
      }),
      instance({
        Modality: 'MR',
        SOPClassUID: MR_SOP_CLASS,
        SOPInstanceUID: 'adc',
        InstanceNumber: 3,
      }),
    ];

    const groups = groupInstancesBySplitRules(
      instances,
      compiledDisplaySetRules
    );

    expect(groups.length).toBe(2);
    expect(
      groups.every((g) => g.matchedRule.id === 'mixedDimensionalityBValue')
    ).toBe(true);
  });

  it('treats a naturalized empty attribute as absent, not as zero', () => {
    // A DiffusionBValue delivered as null is "no b-value", so this series is
    // still mixed and must split - a bare Number(null) === 0 would merge it.
    const instances = [
      instance({
        Modality: 'MR',
        SOPClassUID: MR_SOP_CLASS,
        SOPInstanceUID: 'b1000',
        InstanceNumber: 1,
        DiffusionBValue: 1000,
      }),
      instance({
        Modality: 'MR',
        SOPClassUID: MR_SOP_CLASS,
        SOPInstanceUID: 'adc',
        InstanceNumber: 2,
        DiffusionBValue: null as unknown as number,
      }),
    ];

    expect(
      groupInstancesBySplitRules(instances, compiledDisplaySetRules).length
    ).toBe(2);
  });
});

describe('default rules - image classifier coverage', () => {
  // A SOP class missing from the image classifier falls through to the catch-all
  // and comes back non-displayable, so the series is visible but unrenderable -
  // which is why the classifier list has to be right.
  // Which image rule claims it depends on modality; what matters here is only
  // that a real image rule does, rather than the non-displayable catch-all.
  const claimedBy = (SOPClassUID: string, Modality: string) =>
    ruleIdsFor([
      instance({ SOPClassUID, Modality, SOPInstanceUID: SOPClassUID }),
    ]);

  const shouldRender: [string, string, string][] = [
    ['Ultrasound Image Storage', '1.2.840.10008.5.1.4.1.1.6.1', 'US'],
    ['Ultrasound Multi-frame', '1.2.840.10008.5.1.4.1.1.3.1', 'US'],
    ['Nuclear Medicine Image', '1.2.840.10008.5.1.4.1.1.20', 'NM'],
    ['RT Image Storage', '1.2.840.10008.5.1.4.1.1.481.1', 'RTIMAGE'],
    ['Enhanced PET Image', '1.2.840.10008.5.1.4.1.1.130', 'PT'],
    ['Digital Mammography', '1.2.840.10008.5.1.4.1.1.1.2', 'MG'],
    ['Ophthalmic Tomography', '1.2.840.10008.5.1.4.1.1.77.1.5.4', 'OPT'],
    ['Corneal Topography Map', '1.2.840.10008.5.1.4.1.1.82.1', 'OP'],
    ['RT Dose', '1.2.840.10008.5.1.4.1.1.481.2', 'RTDOSE'],
  ];

  for (const [name, uid, modality] of shouldRender) {
    it(`builds a renderable display set for ${name}`, () => {
      expect(claimedBy(uid, modality)).not.toEqual(['unsupported']);
      expect(claimedBy(uid, modality).length).toBe(1);
    });
  }

  it('does not build an image display set for MR spectroscopy', () => {
    // MR Spectroscopy Storage carries no pixel data, so it belongs to the
    // catch-all rather than to any image rule.
    expect(claimedBy('1.2.840.10008.5.1.4.1.1.4.2', 'MR')).toEqual([
      'unsupported',
    ]);
  });
});

describe('createDisplaySetFromGroup - the handler decides the class', () => {
  /** [name, rule fields, class, isDisplayable] */
  const CASES: [string, Partial<SplitRule>, typeof BaseDisplaySet, boolean][] =
    [
      ['no handler', {}, ImageStackDisplaySet, true],
      ['the image handler', { handler: 'image' }, ImageStackDisplaySet, true],
      [
        'the unsupported handler',
        { handler: 'unsupported' },
        BaseDisplaySet,
        false,
      ],
      ['the video handler', { handler: 'video' }, BaseDisplaySet, true],
    ];

  for (const [name, fields, displaySetClass, isDisplayable] of CASES) {
    it(`builds the display set of ${name}`, () => {
      const displaySet = createDisplaySetFromGroup({
        instances: [instance({ imageId: 'wadors:/x' })],
        matchedRule: { id: 'r', ...fields },
      });
      expect(displaySet.constructor).toBe(displaySetClass);
      expect(displaySet.isDisplayable).toBe(isDisplayable);
    });
  }

  it('copies the viewportTypes of a rule unchanged, and decides the class from handler only', () => {
    const { r: rule } = compileOne({
      handler: 'unsupported',
      viewportTypes: ['stack'],
    });
    const displaySet = createDisplaySetFromGroup({
      instances: [instance({ imageId: 'wadors:/x' })],
      matchedRule: { id: 'r', ...rule },
    });
    expect([
      displaySet.viewportTypes,
      displaySet.constructor,
      displaySet.isDisplayable,
    ]).toEqual([['stack'], BaseDisplaySet, false]);
    expect(
      Object.values(displaySetRules).filter((r) => 'viewportTypes' in r)
    ).toEqual([]);
  });
});

describe('createDisplaySetFromGroup - isVolume, as OHIF isDisplaySetReconstructable', () => {
  const AXIAL = [1, 0, 0, 0, 1, 0];
  const SAGITTAL = [0, 1, 0, 0, 0, 1];
  const slice = (id: string, z: number, orientation = AXIAL) =>
    instance({
      SOPInstanceUID: id,
      InstanceNumber: Math.round(z * 10) + 1,
      imageId: `wadors:/${id}`,
      SamplesPerPixel: 1,
      ImageOrientationPatient: orientation,
      ImagePositionPatient: [0, 0, z],
    });
  const slices = (...zs: number[]) => zs.map((z, i) => slice(`s${i}`, z));
  /** An MR multi-frame instance with these per-frame positions. */
  const multiFrame = (positions: number[][]): NaturalizedInstance =>
    instance({
      SOPInstanceUID: 'mf',
      Modality: 'MR',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.4.1',
      NumberOfFrames: positions.length,
      PixelSpacing: [1, 1],
      SliceThickness: 5,
      ImageOrientationPatient: AXIAL,
      ImagePositionPatient: positions[0],
      PerFrameFunctionalGroupsSequence: positions.map((position) => ({
        PlanePositionSequence: [{ ImagePositionPatient: position }],
      })),
    });

  /** [name, rule fields, instances, isVolume (undefined: absent)] */
  const CASES: [
    string,
    Partial<SplitRule>,
    NaturalizedInstance[],
    boolean | undefined,
  ][] = [
    ['a regular multi-slice series', {}, slices(0, 2.5, 5, 7.5), true],
    ['a single image', {}, slices(0), false],
    // The cases of OHIF isDisplaySetReconstructable.test.js:
    ['single frames with through-plane extent', {}, slices(0, 2, 4), true],
    ['single frames all at one location', {}, slices(0, 0, 0), false],
    ['two single frames at one location', {}, slices(0, 0), false],
    [
      'a multi-frame instance over several locations',
      {},
      [
        multiFrame([
          [0, 0, 0],
          [0, 0, 2],
          [0, 0, 4],
        ]),
      ],
      true,
    ],
    [
      'a multi-frame cine at one location',
      {},
      [
        multiFrame([
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ]),
      ],
      false,
    ],
    // The orientation and spacing tests:
    [
      'a mixed orientation',
      {},
      [slice('a', 0), slice('b', 2), slice('c', 4, SAGITTAL)],
      false,
    ],
    ['a missing slice on a regular lattice', {}, slices(0, 2, 4, 8), true],
    ['an irregular spacing', {}, slices(0, 2, 4, 5), false],
    [
      'a non-image handler',
      { handler: 'segmentation' },
      slices(0, 2, 4),
      undefined,
    ],
  ];

  for (const [name, fields, instances, isVolume] of CASES) {
    it(`gives ${name} isVolume ${isVolume}`, () => {
      const displaySet = createDisplaySetFromGroup({
        instances,
        matchedRule: { id: 'r', ...fields },
      });
      expect(displaySet.isVolume).toBe(isVolume);
    });
  }
});

describe('default rules - the non-image objects', () => {
  const OBJECTS: [string, string, string, string, string][] = [
    [
      'Segmentation',
      '1.2.840.10008.5.1.4.1.1.66.4',
      'SEG',
      'segmentation',
      'segmentation',
    ],
    [
      'Labelmap Segmentation',
      '1.2.840.10008.5.1.4.1.1.66.7',
      'SEG',
      'segmentation',
      'segmentation',
    ],
    [
      'RT Structure Set',
      '1.2.840.10008.5.1.4.1.1.481.3',
      'RTSTRUCT',
      'rtStructureSet',
      'rtStructureSet',
    ],
    [
      'Parametric Map',
      '1.2.840.10008.5.1.4.1.1.30',
      'OT',
      'parametricMap',
      'parametricMap',
    ],
    [
      'Comprehensive SR',
      '1.2.840.10008.5.1.4.1.1.88.33',
      'SR',
      'structuredReport',
      'structuredReport',
    ],
    [
      'Comprehensive 3D SR',
      '1.2.840.10008.5.1.4.1.1.88.34',
      'SR',
      'structuredReport',
      'structuredReport',
    ],
    [
      'Microscopy Bulk Annotations',
      '1.2.840.10008.5.1.4.1.1.91.1',
      'ANN',
      'bulkAnnotation',
      'bulkAnnotation',
    ],
    [
      'Whole slide',
      '1.2.840.10008.5.1.4.1.1.77.1.6',
      'SM',
      'wholeslide',
      'wholeSlide',
    ],
    [
      'RT Plan',
      '1.2.840.10008.5.1.4.1.1.481.5',
      'RTPLAN',
      'unsupported',
      'unsupported',
    ],
    [
      'Grayscale Presentation State',
      '1.2.840.10008.5.1.4.1.1.11.1',
      'PR',
      'unsupported',
      'unsupported',
    ],
  ];

  for (const [name, SOPClassUID, Modality, ruleId, handler] of OBJECTS) {
    it(`gives ${name} one display set for each series, with its handler name`, () => {
      const groups = groupInstancesBySplitRules(
        ['a', 'b'].map((id, index) =>
          instance({
            SOPClassUID,
            Modality,
            SOPInstanceUID: id,
            InstanceNumber: index + 1,
            imageId: `wadors:/${id}`,
          })
        ),
        compiledDisplaySetRules
      );
      expect(groups.map((g) => g.matchedRule.id)).toEqual([ruleId]);
      const displaySet = createDisplaySetFromGroup(groups[0]);
      expect(displaySet.handler).toBe(handler);
      expect(DISPLAY_SET_HANDLER_NAMES as readonly string[]).toContain(handler);
    });
  }

  it('copies Manufacturer and ManufacturerModelName into the SR display set', () => {
    const [group] = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.34',
          Modality: 'SR',
          Manufacturer: 'CornerstoneJS',
          ManufacturerModelName: '@cornerstonejs/adapters',
        }),
      ],
      compiledDisplaySetRules
    );
    const { Manufacturer, ManufacturerModelName } = createDisplaySetFromGroup(
      group
    ) as unknown as Record<string, unknown>;
    expect([Manufacturer, ManufacturerModelName]).toEqual([
      'CornerstoneJS',
      '@cornerstonejs/adapters',
    ]);
  });

  it('builds no image stack for a non-image object', () => {
    const [group] = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          Modality: 'SEG',
          NumberOfFrames: 3,
          imageId: 'wadors:/seg',
        }),
      ],
      compiledDisplaySetRules
    );
    const displaySet = createDisplaySetFromGroup(group);
    expect(displaySet.isDisplayable).toBe(true);
    expect(displaySet.underlyingImageIds).toEqual(['wadors:/seg']);
    expect(displaySet.imageIds).toEqual(['wadors:/seg']);
  });

  it('gives an image display set no handler', () => {
    const [group] = groupInstancesBySplitRules(
      [instance()],
      compiledDisplaySetRules
    );
    expect(createDisplaySetFromGroup(group).handler).toBeUndefined();
  });
});

describe('default rules - revision chains of documents', () => {
  const PDF = '1.2.840.10008.5.1.4.1.1.104.1';
  /** A PDF that names its predecessors in PredecessorDocumentsSequence. */
  const pdf = (
    id: string,
    InstanceNumber: number,
    predecessors: string[] = [],
    SeriesInstanceUID = 'series-1'
  ) =>
    instance({
      SOPClassUID: PDF,
      Modality: 'DOC',
      SOPInstanceUID: id,
      SeriesInstanceUID,
      InstanceNumber,
      PredecessorDocumentsSequence: predecessors.length
        ? [
            {
              ReferencedSeriesSequence: [
                {
                  SeriesInstanceUID,
                  ReferencedSOPSequence: predecessors.map((uid) => ({
                    ReferencedSOPInstanceUID: uid,
                  })),
                },
              ],
            },
          ]
        : undefined,
    });

  /** [name, instances, [instances of each display set in order, active]]. */
  const CASES: [string, NaturalizedInstance[], [string[], string][]][] = [
    [
      'two PDFs without predecessors',
      [pdf('a', 1), pdf('b', 2)],
      [
        [['a'], 'a'],
        [['b'], 'b'],
      ],
    ],
    [
      'a chain A <- B <- C',
      [pdf('c', 3, ['b']), pdf('a', 1), pdf('b', 2, ['a'])],
      [[['a', 'b', 'c'], 'c']],
    ],
    [
      'a predecessor in another series',
      [pdf('b', 2, ['a']), pdf('a', 1, [], 'series-2')],
      [
        [['a'], 'a'],
        [['b'], 'b'],
      ],
    ],
    [
      'a branch, input [A, B, C]: B is first in the default order and takes A',
      [pdf('a', 1), pdf('b', 2, ['a']), pdf('c', 3, ['a'])],
      [
        [['a', 'b'], 'b'],
        [['c'], 'c'],
      ],
    ],
    [
      'the same branch, input [C, A, B]: the input order does not decide',
      [pdf('c', 3, ['a']), pdf('a', 1), pdf('b', 2, ['a'])],
      [
        [['a', 'b'], 'b'],
        [['c'], 'c'],
      ],
    ],
  ];

  for (const [name, instances, expected] of CASES) {
    it(`gives ${name}: one display set for each chain, the active instance last`, () => {
      const displaySets = groupInstancesBySplitRules(
        instances,
        compiledDisplaySetRules
      ).map((group) => {
        expect(group.matchedRule.id).toBe('encapsulatedDocument');
        const displaySet = createDisplaySetFromGroup(
          group
        ) as unknown as Record<string, unknown>;
        return [
          group.instances.map((i) => i.SOPInstanceUID as string),
          displaySet.activeSopInstanceUid,
        ] as [string[], string];
      });
      displaySets.sort((x, y) => (x[1] < y[1] ? -1 : 1));
      expect(displaySets).toEqual(expected);
    });
  }
});

describe('default rules - video', () => {
  const MPEG4 = '1.2.840.10008.1.2.4.102';
  const EXPLICIT_LE = '1.2.840.10008.1.2.1';
  const SC = '1.2.840.10008.5.1.4.1.1.7';
  const VIDEO_PHOTOGRAPHIC = '1.2.840.10008.5.1.4.1.1.77.1.4.1';

  // The code test and the context expression must agree.
  const VIDEO: [string, Partial<NaturalizedInstance>, boolean][] = [
    [
      'a video-only SOP class with an image syntax',
      { SOPClassUID: VIDEO_PHOTOGRAPHIC, TransferSyntaxUID: EXPLICIT_LE },
      true,
    ],
    [
      'a video transfer syntax',
      { SOPClassUID: CT_SOP_CLASS, TransferSyntaxUID: MPEG4 },
      true,
    ],
    [
      'one video syntax among the available ones',
      {
        SOPClassUID: SC,
        AvailableTransferSyntaxUID: [EXPLICIT_LE, MPEG4] as unknown as string,
      },
      true,
    ],
    [
      'a long secondary capture with no transfer syntax',
      { SOPClassUID: SC, NumberOfFrames: '90' as unknown as number },
      true,
    ],
    [
      'a long secondary capture with an image syntax',
      { SOPClassUID: SC, NumberOfFrames: 90, TransferSyntaxUID: EXPLICIT_LE },
      false,
    ],
    [
      'a short secondary capture',
      { SOPClassUID: SC, NumberOfFrames: 89 },
      false,
    ],
  ];
  for (const [name, overrides, expected] of VIDEO) {
    it(`classifies ${name} the same in code and in the rules`, () => {
      const subject = instance(overrides);
      expect(isVideoInstance(subject)).toBe(expected);
      expect(ruleIdsFor([subject])[0] === 'video').toBe(expected);
    });
  }
});

describe('default rules - the unsupported catch-all', () => {
  const NON_IMAGE_SOP_CLASSES: [string, string, string][] = [
    ['RT Plan', '1.2.840.10008.5.1.4.1.1.481.5', 'RTPLAN'],
    ['Grayscale Presentation State', '1.2.840.10008.5.1.4.1.1.11.1', 'PR'],
    ['Raw Data Storage', '1.2.840.10008.5.1.4.1.1.66', 'OT'],
  ];

  const displaySetFor = (SOPClassUID: string, Modality: string) => {
    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID,
          Modality,
          SOPInstanceUID: 'obj-1',
          imageId: 'wadors:/obj-1',
          Rows: undefined,
          Columns: undefined,
        }),
      ],
      compiledDisplaySetRules
    );
    return createDisplaySetFromGroup(groups[0]);
  };

  for (const [name, uid, modality] of NON_IMAGE_SOP_CLASSES) {
    it(`claims ${name} instead of dropping it`, () => {
      // Nothing may be silently dropped: an object with no display set leaves no
      // trace that it was in the study at all.
      expect(
        ruleIdsFor([instance({ SOPClassUID: uid, Modality: modality })])
      ).toEqual(['unsupported']);
    });
  }

  it('marks the display set as not displayable', () => {
    const displaySet = displaySetFor('1.2.840.10008.5.1.4.1.1.11.1', 'PR');

    expect(displaySet.isDisplayable).toBe(false);
    expect(displaySet.handler).toBe('unsupported');
  });

  it('records what it could not render, so a consumer can say which kind', () => {
    const displaySet = displaySetFor('1.2.840.10008.5.1.4.1.1.481.5', 'RTPLAN');

    expect(displaySet.sopClassUids).toEqual(['1.2.840.10008.5.1.4.1.1.481.5']);
    expect(displaySet.instances[0].Modality).toBe('RTPLAN');
  });

  it('advertises no renderable imageIds but stays resolvable by imageId', () => {
    const displaySet = displaySetFor('1.2.840.10008.5.1.4.1.1.481.5', 'RTPLAN');

    // Empty imageIds: anything that ignores isDisplayable renders nothing rather
    // than treating a document as a one-frame image stack.
    expect(displaySet.imageIds).toEqual([]);
    expect(displaySet.underlyingImageIds).toEqual(['wadors:/obj-1']);
  });

  it('produces one display set for each series, with the SOP classes it holds', () => {
    // A series of many presentation states must be one entry, not one per object.
    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.481.5',
          Modality: 'RTPLAN',
          SOPInstanceUID: 'plan-1',
          InstanceNumber: 1,
          Rows: undefined,
        }),
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.1',
          Modality: 'PR',
          SOPInstanceUID: 'pr-1',
          InstanceNumber: 2,
          Rows: undefined,
        }),
      ],
      compiledDisplaySetRules
    );

    expect(groups.map((group) => group.matchedRule.id)).toEqual([
      'unsupported',
    ]);
    expect(createDisplaySetFromGroup(groups[0]).sopClassUids).toEqual([
      '1.2.840.10008.5.1.4.1.1.481.5',
      '1.2.840.10008.5.1.4.1.1.11.1',
    ]);
  });

  it('lets a fallback rule above the priority limit run before the catch-all', () => {
    const rules = createDisplaySetSplitRules({
      ...displaySetRules,
      prFallback: { priority: 20000, matches: { Modality: 'PR' } },
    });
    const pr = instance({
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.1',
      Modality: 'PR',
      Rows: undefined,
    });

    expect(ruleIdsFor([pr], rules)).toEqual(['prFallback']);
  });

  it('gives an image SOP class whose Rows have not loaded, or are null, to defaultImageRule', () => {
    expect(
      ruleIdsFor([instance({ SOPInstanceUID: 'ct-no-rows', Rows: undefined })])
    ).toEqual(['defaultImageRule']);
    expect(
      ruleIdsFor([
        instance({
          SOPInstanceUID: 'null-rows',
          Rows: null as unknown as number,
        }),
      ])
    ).toEqual(['defaultImageRule']);
  });

  it('yields to an application rule with a lower priority', () => {
    // This is how an application that *does* support SEG opts in.
    const rules = createDisplaySetSplitRules({
      ...displaySetRules,
      seg: {
        priority: -1,
        matches: { Modality: 'SEG' },
      },
    });

    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          Modality: 'SEG',
          SOPInstanceUID: 'seg-1',
        }),
      ],
      rules
    );

    expect(groups[0].matchedRule.id).toBe('seg');
    expect(createDisplaySetFromGroup(groups[0]).isDisplayable).toBe(true);
  });

  it('has the highest priority, so it never shadows a real one', () => {
    const priorities = Object.values(displaySetRules).map(
      (rule) => rule.priority as number
    );
    expect(displaySetRules.unsupported.priority).toBe(Math.max(...priorities));
    // A rule with no `matches` claims everything, so any later rule is dead code.
    const catchAlls = Object.entries(displaySetRules).filter(
      ([, rule]) => !rule.matches
    );
    expect(catchAlls.map(([id]) => id)).toEqual(['unsupported']);
  });

  it('lets a fallback rule run between the last object rule and unsupported', () => {
    const rules = createDisplaySetSplitRules({
      ...displaySetRules,
      prFallback: {
        priority: 16,
        matches: { Modality: 'PR' },
      },
    });

    expect(
      ruleIdsFor(
        [
          instance({
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.1',
            Modality: 'PR',
          }),
          instance({
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.481.5',
            Modality: 'RTPLAN',
          }),
        ],
        rules
      )
    ).toEqual(['prFallback', 'unsupported']);
  });

  it('can be excluded with a null priority', () => {
    const rules = createDisplaySetSplitRules({
      ...displaySetRules,
      unsupported: { ...displaySetRules.unsupported, priority: null },
    });
    const unmatched: NaturalizedInstance[] = [];

    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.11.1',
          Modality: 'PR',
        }),
      ],
      rules,
      (i) => unmatched.push(i)
    );

    expect(groups).toEqual([]);
    expect(unmatched.length).toBe(1);
  });
});

const compileOne = (rule: Record<string, unknown>, options = {}) =>
  createDisplaySetSplitRules(
    { r: { priority: 1, ...rule } } as unknown as DisplaySetRules,
    options
  );

/** The compile error of the rule `r`. */
const errorOf = (
  rule: Record<string, unknown>,
  options = {}
): RuleCompileError => {
  try {
    compileOne(rule, options);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleCompileError);
    return error as RuleCompileError;
  }
  throw new Error('expected the rule to fail to compile');
};

/**
 * Checks a compile error as RL-TEST-6 asks: the path names the rule and the
 * place, and the message names the offending name. The prose is not checked.
 */
const expectRejected = (
  rule: Record<string, unknown>,
  path: string,
  name: string,
  options = {}
) => {
  const error = errorOf(rule, options);
  expect(error.path).toBe(path);
  expect(error.message).toContain(name);
};

/** The SOPInstanceUIDs of the instances that the rule `r` claims. */
const claimed = (
  rule: Record<string, unknown>,
  instances: NaturalizedInstance[],
  options = {}
) =>
  groupInstancesBySplitRules(instances, compileOne(rule, options)).flatMap(
    (group) => group.instances.map((i) => i.SOPInstanceUID)
  );

describe('matches - absent and empty values (DICOM meaning)', () => {
  // undefined is absent; null, '' and [] are empty; "no value" is either.
  const subjects = [
    ['absent', undefined],
    ['null', null],
    ['text', ''],
    ['array', []],
    ['zero', 0],
  ].map(([id, BodyPartThickness], index) =>
    instance({
      SOPInstanceUID: id as string,
      InstanceNumber: index + 1,
      BodyPartThickness,
    })
  );
  const holds = (matches: unknown, options = {}) =>
    claimed({ matches }, subjects, options);
  const NO_VALUE = ['absent', 'null', 'text', 'array'];

  it('reads "X": null as "no value", and { notNull: true } as its exact opposite', () => {
    expect(holds({ BodyPartThickness: null })).toEqual(NO_VALUE);
    expect(holds({ BodyPartThickness: { notNull: true } })).toEqual(['zero']);
  });

  it('reads X == null as "no value", and X == undefined as "absent" only', () => {
    const options = {
      context: {
        hasNoThickness: 'BodyPartThickness == null',
        isAbsent: 'BodyPartThickness == undefined',
      },
    };
    expect(holds({ hasNoThickness: true }, options)).toEqual(NO_VALUE);
    expect(holds({ isAbsent: true }, options)).toEqual(['absent']);
  });

  it('gives false for an ordering comparison on no value, and never reads it as 0', () => {
    const options = { context: { isThin: 'BodyPartThickness < 1' } };
    expect(holds({ isThin: true }, options)).toEqual(['zero']);
    expect(holds({ BodyPartThickness: { lessThan: 1 } })).toEqual(['zero']);
    expect(holds({ BodyPartThickness: { range: [-1, 1] } })).toEqual(['zero']);
  });

  it('fails a test on no value, and holds its doesNot form', () => {
    expect(holds({ BodyPartThickness: { contains: '0' } })).toEqual(['zero']);
    expect(holds({ BodyPartThickness: { doesNotContain: '0' } })).toEqual(
      NO_VALUE
    );
    expect(holds({ BodyPartThickness: { doesNotEqual: 0 } })).toEqual(NO_VALUE);
  });
});

describe('matches - the operator meanings', () => {
  const holds = (value: unknown, test: unknown) =>
    claimed({ matches: { ImageType: test } }, [
      instance({ SOPInstanceUID: 'x', ImageType: value }),
    ]).length === 1;

  it('reads greaterThan and lessThan as strict, and a numeric string as a number', () => {
    expect(holds(2, { greaterThan: 1 })).toBe(true);
    expect(holds(1, { greaterThan: 1 })).toBe(false);
    expect(holds('2', { greaterThan: 1 })).toBe(true);
    expect(holds(1, { lessThan: 1 })).toBe(false);
  });

  const INCLUSIVE: [unknown, unknown, boolean][] = [
    [1, { greaterThanOrEqual: 1 }, true],
    [0, { greaterThanOrEqual: 1 }, false],
    ['2', { greaterThanOrEqual: 2 }, true],
    [[3, 1], { greaterThanOrEqual: 3 }, true],
    [1, { lessThanOrEqual: 1 }, true],
    [2, { lessThanOrEqual: 1 }, false],
    ['x', { lessThanOrEqual: 1 }, false],
    [undefined, { greaterThanOrEqual: 0 }, false],
  ];
  it('reads greaterThanOrEqual and lessThanOrEqual with the limit included', () => {
    for (const [value, test, expected] of INCLUSIVE) {
      expect([value, test, holds(value, test)]).toEqual([
        value,
        test,
        expected,
      ]);
    }
  });

  it('reads a number shorthand and equals with ==', () => {
    expect(holds('1', 1)).toBe(true);
    expect(holds('1', { equals: 1 })).toBe(true);
    expect(holds(['MR'], { equals: 'MR' })).toBe(true);
    expect(holds('CT', ['MR', 'CT'])).toBe(true);
  });

  const WHOLE_VALUE: [unknown, unknown, boolean][] = [
    [['R', 'L'], { equals: ['R', 'L'] }, true],
    [['L', 'R'], { equals: ['R', 'L'] }, false],
    [['R', 'L', 'F'], { equals: ['R', 'L'] }, false],
    ['R', { equals: ['R', 'L'] }, false],
    [['R', 'L'], { doesNotEqual: ['R', 'L'] }, false],
    [true, { equals: 'true' }, true],
    [true, { equals: 1 }, false],
    [true, { equals: '1' }, false],
  ];
  it('compares the whole value in equals, also with an array operand, and a boolean only with its text', () => {
    for (const [value, test, expected] of WHOLE_VALUE) {
      expect([value, test, holds(value, test)]).toEqual([
        value,
        test,
        expected,
      ]);
    }
  });

  it('reads includes with a scalar operand as "has the element"', () => {
    expect(holds(['ORIGINAL', 'LOCALIZER'], { includes: 'LOCALIZER' })).toBe(
      true
    );
    expect(holds('LOCALIZER', { includes: 'LOCALIZER' })).toBe(true);
    expect(holds(['ORIGINAL'], { includes: ['AXIAL', 'ORIGINAL'] })).toBe(true);
    expect(holds(['ORIGINAL'], { doesNotInclude: 'LOCALIZER' })).toBe(true);
  });

  // [value, test, holds]: the shorthand is includes in both forms; equals
  // compares the whole value.
  const SHORTHAND: [unknown, unknown, boolean][] = [
    ['LOCALIZER', 'LOCALIZER', true],
    [['ORIGINAL', 'LOCALIZER'], 'LOCALIZER', true],
    [['ORIGINAL', 'PRIMARY'], 'LOCALIZER', false],
    ['ORIGINAL', ['ORIGINAL', 'PRIMARY'], true],
    [['ORIGINAL', 'SECONDARY'], ['ORIGINAL', 'PRIMARY'], true],
    [['DERIVED', 'SECONDARY'], ['ORIGINAL', 'PRIMARY'], false],
    [['ORIGINAL', 'LOCALIZER'], { equals: ['LOCALIZER'] }, false],
    [['ORIGINAL', 'LOCALIZER'], { equals: ['ORIGINAL', 'LOCALIZER'] }, true],
    [['ORIGINAL', 'LOCALIZER'], { equals: 'LOCALIZER' }, false],
    [true, true, true],
    [false, true, false],
  ];
  it('reads a scalar and an array shorthand as includes, and equals as the whole value', () => {
    for (const [value, test, expected] of SHORTHAND) {
      expect([value, test, holds(value, test)]).toEqual([
        value,
        test,
        expected,
      ]);
    }
  });

  it('fails notNull for an empty string', () => {
    expect(holds('', { notNull: true })).toBe(false);
  });

  it('reads false on a named boolean as its negation', () => {
    expect(
      claimed({ matches: { isMultiFrame: false } }, [
        instance({ SOPInstanceUID: 'single', InstanceNumber: 1 }),
        instance({
          SOPInstanceUID: 'clip',
          InstanceNumber: 2,
          NumberOfFrames: 4,
        }),
      ])
    ).toEqual(['single']);
  });

  it('rejects an operand of the wrong kind, a second operator and an unknown operator', () => {
    const at = "rule 'r'.matches.Rows";
    expectRejected(
      { matches: { Rows: { greaterThan: '1' } } },
      at,
      'greaterThan'
    );
    expectRejected(
      { matches: { Rows: { greaterThan: 1, lessThan: 9 } } },
      at,
      'lessThan'
    );
    expectRejected({ matches: { Rows: { greater: 1 } } }, at, "'greater'");
  });

  it('rejects the removed forms: all, not, a comparison key, an expression and null', () => {
    for (const name of ['all', 'not', 'NumberOfFrames >']) {
      expectRejected(
        { matches: { [name]: { Modality: 'CT' } } },
        `rule 'r'.matches.${name}`,
        `'${name}'`
      );
    }
    expectRejected(
      { matches: "Modality == 'CT'" },
      "rule 'r'.matches",
      "Modality == 'CT'"
    );
    // A null matches is an error, and not a catch-all.
    expectRejected({ matches: null }, "rule 'r'.matches", 'null');
  });
});

describe('names - the compile checks every name', () => {
  it('rejects a misspelt keyword in every place, with the rule, the place and the name', () => {
    expectRejected(
      { matches: { BodyPartExamind: 'CHEST' } },
      "rule 'r'.matches.BodyPartExamind",
      "'BodyPartExamind'"
    );
    expectRejected(
      { groupBy: ['SeriesInstanceUId'] },
      "rule 'r'.groupBy[0]",
      "'SeriesInstanceUId'"
    );
    expectRejected(
      { sortBy: ['sweepStrat'] },
      "rule 'r'.sortBy[0]",
      "'sweepStrat'"
    );
    expectRejected(
      { attributes: { label: { template: '{SeriesDescriptio}' } } },
      "rule 'r'.attributes.label.template",
      "'SeriesDescriptio'"
    );
    expectRejected(
      { context: { isChest: "BodyPartExamind == 'CHEST'" } },
      "rule 'r'.context.isChest",
      "'BodyPartExamind'"
    );
    expectRejected({}, 'context.isLarge', "'pixelCont'", {
      context: { isLarge: 'pixelCont > 1' },
    });
  });

  it('matches names and operators with the same case, and names the correct one', () => {
    // The suggestion is user experience, so this test checks the text.
    expect(errorOf({ matches: { modality: 'CT' } }).message).toContain(
      "unknown name 'modality'; did you mean 'Modality'?"
    );
    expect(errorOf({ matches: { Rows: { notnull: true } } }).message).toContain(
      "unknown operator 'notnull'; did you mean 'notNull'?"
    );
    // imageId is a declared context name, also with the keyword ImageID.
    expect(() => compileOne({ attributes: { id: 'imageId' } })).not.toThrow();
  });

  it('reads a hex tag only through a declaration', () => {
    expectRejected(
      { matches: { '00191010': 1 } },
      "rule 'r'.matches.00191010",
      "'00191010'"
    );
    const rule = {
      context: { vendorBValue: { attribute: '00191010', vr: 'FD', vm: '1' } },
      matches: { vendorBValue: { greaterThan: 0 } },
    };
    expect(
      claimed(rule, [
        instance({ SOPInstanceUID: 'b', '00191010': 800 }),
        instance({ SOPInstanceUID: 'none' }),
      ])
    ).toEqual(['b']);
  });

  it('rejects a context name that is a keyword, or that does not start in lowercase', () => {
    expectRejected(
      { context: { Modality: "'CT'" } },
      "rule 'r'.context.Modality",
      "'Modality'"
    );
    expectRejected(
      { context: { IsChest: 'true' } },
      "rule 'r'.context.IsChest",
      "'IsChest'"
    );
  });
});

describe('the display set context', () => {
  /** Two sweeps 55 s apart, each with two frames 5 s apart. */
  const sweeps = () =>
    ['090000', '090005', '090100', '090105'].map((AcquisitionTime, index) =>
      instance({
        SOPInstanceUID: `us-${index}`,
        Modality: 'US',
        AcquisitionTime,
        InstanceNumber: index + 1,
      })
    );
  const sweepRule = {
    matches: { sweepCount: { greaterThan: 1 } },
    groupBy: ['SeriesInstanceUID', 'sweepStart'],
  };

  it('reads a series field and an instance field of a group by their aliases', () => {
    const groups = groupInstancesBySplitRules(sweeps(), compileOne(sweepRule));
    expect(groups.map((g) => g.instances.length)).toEqual([2, 2]);
  });

  it('lets a rule context replace an argument for that rule only, also inside the global entries', () => {
    const rules = createDisplaySetSplitRules({
      wideGap: {
        priority: 1,
        ...sweepRule,
        context: { timeClustersMaxGap: 60 },
      },
      defaultGap: { priority: 2, ...sweepRule },
    });
    // With a gap of 60 s the series is one sweep, so `wideGap` does not match.
    expect(
      groupInstancesBySplitRules(sweeps(), rules).map((g) => g.matchedRule.id)
    ).toEqual(['defaultGap', 'defaultGap']);
  });

  it('lets a rule select a different group, and every alias follows', () => {
    const rule = {
      ...sweepRule,
      context: { timeClusters: 'longTimeClusters' },
    };
    expect(claimed(rule, sweeps())).toEqual([]);
  });

  it('computes an entry one time for each series for all rules that do not replace it', () => {
    const compute = jest.fn(() => ({ count: 2 }));
    const rules = createDisplaySetSplitRules(
      {
        a: { priority: 1, matches: { counted: 3 } },
        b: { priority: 2, matches: { counted: 2 } },
        c: {
          priority: 3,
          context: { counted: 'summary.count + 1' },
          matches: { counted: 3 },
        },
      },
      {
        context: {
          summary: { function: 'summarize' },
          counted: 'summary.count',
        },
        seriesFunctions: {
          summarize: { compute, fields: { count: 'series' } },
        },
      }
    );
    const groups = groupInstancesBySplitRules(sweeps(), rules);
    expect([...new Set(groups.map((g) => g.matchedRule.id))]).toEqual(['b']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('gives a rule entry that reads its own name the global value', () => {
    const rule = {
      context: { seriesInstanceCount: 'seriesInstanceCount * 2' },
      matches: { seriesInstanceCount: 8 },
    };
    expect(claimed(rule, sweeps()).length).toBe(4);
  });

  it('rejects a loop of entries, an unknown group field, and a group replaced by a value', () => {
    expectRejected({}, 'context.first', 'first -> second -> first', {
      context: { first: 'second + 1', second: 'first' },
    });
    expectRejected({}, 'context.sweeps', "'cluster'", {
      context: { sweeps: 'timeClusters.cluster' },
    });
    expectRejected(
      { context: { timeClusters: 5 }, groupBy: ['sweepStart'] },
      'context.sweepStart',
      "'timeClusters'"
    );
  });

  it('runs min, max, sum and count over the series in a series entry', () => {
    const rule = {
      context: {
        mostFrames: 'series.instances.max(NumberOfFrames)',
        withFrames: 'series.instances.count(NumberOfFrames)',
      },
      matches: { mostFrames: 9, withFrames: 2 },
    };
    expect(
      claimed(rule, [
        instance({ SOPInstanceUID: 'a', InstanceNumber: 1, NumberOfFrames: 9 }),
        instance({
          SOPInstanceUID: 'b',
          InstanceNumber: 2,
          NumberOfFrames: '3' as unknown as number,
        }),
        instance({ SOPInstanceUID: 'c', InstanceNumber: 3 }),
      ])
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('sortBy and attributes', () => {
  const series = () =>
    [3, 1, 2].map((SliceLocation) =>
      instance({
        SOPInstanceUID: `s${SliceLocation}`,
        SliceLocation,
        InstanceNumber: 4 - SliceLocation,
        NumberOfFrames: SliceLocation,
        SeriesDescription: 'AX',
      })
    );
  const firstGroup = (rule: Record<string, unknown>, options = {}) =>
    groupInstancesBySplitRules(series(), compileOne(rule, options))[0];

  it('sorts by a name in ascending order, and by a named sort function', () => {
    expect(
      firstGroup({ sortBy: ['SliceLocation'] }).instances.map(
        (i) => i.SliceLocation
      )
    ).toEqual([1, 2, 3]);
    const descending: SplitRule['compareInstances'] = (a, b) =>
      (b.SliceLocation as number) - (a.SliceLocation as number);
    expect(
      firstGroup(
        { sortBy: [{ sortFunction: 'descending' }] },
        { sortFunctions: { descending } }
      ).instances.map((i) => i.SliceLocation)
    ).toEqual([3, 2, 1]);
    expectRejected(
      { sortBy: [{ sortFunction: 'missing' }] },
      "rule 'r'.sortBy[0].sortFunction",
      '"missing"'
    );
  });

  it('reads a keyword in attributes from the first instance of the sorted display set', () => {
    const group = firstGroup({
      sortBy: ['SliceLocation'],
      attributes: {
        firstSlice: 'SliceLocation',
        label: { template: '{SeriesDescription} #{splitNumber}' },
        fixed: { template: 'SCOUT' },
        flag: true,
      },
    });
    const { firstSlice, label, fixed, flag } = createDisplaySetFromGroup(
      group,
      {
        splitNumber: 1,
      }
    ) as unknown as Record<string, unknown>;
    expect({ firstSlice, label, fixed, flag }).toEqual({
      firstSlice: 1,
      label: 'AX #1',
      fixed: 'SCOUT',
      flag: true,
    });
  });

  it('rejects a bare string that is not a name, and names the template form', () => {
    // The two hints are user experience, so this test checks their text.
    const error = errorOf({ attributes: { label: 'SCOUT' } });
    expect(error.path).toBe("rule 'r'.attributes.label");
    expect(error.message).toMatch(/^Invalid display set rules: rule 'r'/);
    expect(error.message).toContain('"myValue": { "attribute": "SCOUT" }');
    expect(error.message).toContain('fixed text is { "template": "SCOUT" }');
  });

  it('aggregates over the series or over the display set, as the receiver names', () => {
    const groups = groupInstancesBySplitRules(
      series(),
      compileOne({
        context: {
          isThick: 'SliceLocation > 1',
          seriesMaxFrames: 'series.instances.max(NumberOfFrames)',
        },
        groupBy: ['SeriesInstanceUID', 'isThick'],
        attributes: {
          seriesMax: 'seriesMaxFrames',
          displaySetMax: {
            expression: 'displaySet.instances.max(NumberOfFrames)',
          },
          displaySetTotal: {
            expression: 'displaySet.instances.sum(NumberOfFrames)',
          },
        },
      })
    );
    expect(
      groups.map((group) => {
        const { seriesMax, displaySetMax, displaySetTotal } =
          createDisplaySetFromGroup(group) as unknown as Record<
            string,
            unknown
          >;
        return [seriesMax, displaySetMax, displaySetTotal];
      })
    ).toEqual([
      [3, 1, 1],
      [3, 3, 5],
    ]);
  });

  it('reads a bare name over the series, and displaySet.<name> over the display set', () => {
    const groups = groupInstancesBySplitRules(
      series(),
      compileOne(
        {
          context: {
            count: { function: 'countOf' },
            countN: 'count.n',
            isThick: 'SliceLocation > 1',
          },
          groupBy: ['SeriesInstanceUID', 'isThick'],
          sortBy: ['displaySet.count.n', 'SliceLocation'],
          attributes: {
            seriesCount: 'countN',
            displaySetCount: 'displaySet.count.n',
            label: { template: '{countN}/{displaySet.countN}' },
            both: { expression: 'displaySet.count.n * 10 + countN' },
          },
        },
        {
          seriesFunctions: {
            countOf: {
              compute: (instances: NaturalizedInstance[]) => ({
                n: instances.length,
              }),
              fields: { n: 'series' },
            },
          },
        }
      )
    );
    expect(
      groups.map((group) => {
        const { seriesCount, displaySetCount, label, both } =
          createDisplaySetFromGroup(group) as unknown as Record<
            string,
            unknown
          >;
        return [seriesCount, displaySetCount, label, both];
      })
    ).toEqual([
      [3, 1, '3/1', 13],
      [3, 2, '3/2', 23],
    ]);
  });

  it('rejects the displaySet. prefix outside sortBy and attributes', () => {
    expectRejected(
      { matches: { 'displaySet.sliceSpacing': 1 } },
      "rule 'r'.matches.displaySet.sliceSpacing",
      'sortBy and attributes'
    );
    expectRejected(
      { groupBy: ['displaySet.sliceIndex'] },
      "rule 'r'.groupBy[0]",
      'sortBy and attributes'
    );
    expectRejected(
      { context: { spacing: 'displaySet.sliceSpacing' } },
      "rule 'r'.context.spacing",
      'sortBy and attributes'
    );
    expectRejected(
      { context: { g: { function: 'planeGeometry', over: 'series' } } },
      "rule 'r'.context.g",
      "'over'"
    );
  });

  it('rejects a bare aggregate, displaySet.instances outside attributes, and displaySets', () => {
    expectRejected(
      { context: { most: 'max(Rows)' } },
      "rule 'r'.context.most",
      'max('
    );
    expectRejected(
      { context: { most: 'displaySet.instances.max(Rows)' } },
      "rule 'r'.context.most",
      'displaySet.instances'
    );
    expectRejected(
      { attributes: { all: { expression: 'displaySets.instances.count()' } } },
      "rule 'r'.attributes.all.expression",
      'displaySets'
    );
  });

  it('reads splitNumber and sopClassUids in attributes only', () => {
    expectRejected(
      { matches: { splitNumber: 1 } },
      "rule 'r'.matches.splitNumber",
      "'splitNumber'"
    );
  });
});

describe('createDisplaySetSplitRules - validation', () => {
  it('rejects rules that are not an object keyed by rule id', () => {
    expect(createDisplaySetSplitRules({})).toEqual({});
    expect(() => createDisplaySetSplitRules('rules' as never)).toThrow(
      /Invalid display set rules: the rules must be an object keyed by rule id/
    );
    expect(() =>
      createDisplaySetSplitRules([{ id: 'x', priority: 1 }] as never)
    ).toThrow(/the rules must be an object keyed by rule id/);
  });

  // JSON.parse makes `__proto__` a real own key. Stored in a plain object, the
  // key replaces the prototype, so the entry is lost with no error.
  it('rejects a __proto__ key instead of losing the entry', () => {
    expect(() =>
      createDisplaySetSplitRules(JSON.parse('{"__proto__": {"priority": 1}}'))
    ).toThrow(/"__proto__"/);
    expectRejected(
      { attributes: JSON.parse('{"__proto__": {"template": "x"}}') },
      "rule 'r'.attributes.__proto__",
      '__proto__'
    );
    expectRejected(
      { context: JSON.parse('{"__proto__": 1}') },
      "rule 'r'.context.__proto__",
      '__proto__'
    );
  });

  it('rejects an unknown rule field, with the rule id and the field', () => {
    expectRejected({ matchs: { Modality: 'CT' } }, "rule 'r'", "'matchs'");
  });
});

describe('createDisplaySetSplitRules - the code form', () => {
  it('passes a function through at every function place', () => {
    const matches = (i: NaturalizedInstance) => i.Modality === 'CT';
    const groupByPart = (i: NaturalizedInstance) => i.Rows;
    const comparator = () => 0;
    const customAttributes = () => ({ label: 'fn' });

    const compiled = compileOne({
      matches,
      groupBy: ['SeriesInstanceUID', groupByPart],
      sortBy: [comparator],
      attributes: customAttributes,
    }).r;

    expect(compiled.matches).toBe(matches);
    expect(compiled.groupBy?.[1]).toBe(groupByPart);
    expect(compiled.compareInstances).toBe(comparator);
    expect(compiled.customAttributes).toBe(customAttributes);
  });

  it('accepts a code context entry, a function test and a function attribute', () => {
    const compiled = compileOne(
      {
        matches: {
          isWide: true,
          Rows: (value: unknown) => Number(value) > 256,
        },
        attributes: {
          twice: (instances: NaturalizedInstance[]) =>
            (instances[0].Rows as number) * 2,
        },
      },
      {
        context: {
          isWide: (_i: NaturalizedInstance, values: Record<string, unknown>) =>
            (values.Columns as number) >= 512,
        },
      }
    ).r;
    const big = instance({ Rows: 512 });
    expect(compiled.matches?.(big, { series: {} })).toBe(true);
    expect(compiled.matches?.(instance({ Rows: 128 }), { series: {} })).toBe(
      false
    );
    expect(
      compiled.customAttributes?.({ instance: big }, { instances: [big] })
    ).toEqual({ twice: 1024 });
  });

  it('reads no name from the prototype chain', () => {
    for (const name of ['toString', 'constructor']) {
      expectRejected(
        { matches: { [name]: 1 } },
        `rule 'r'.matches.${name}`,
        `'${name}'`
      );
    }
  });
});

describe('createDisplaySetSplitRules - groupId', () => {
  it('does not change how a rule splits: the split key stays per rule id', () => {
    const rules = createDisplaySetSplitRules({
      tomo: {
        priority: 1,
        groupId: 'mammo',
        matches: { ImageType: { includes: 'TOMO' } },
      },
      legacy: { priority: 2, groupId: 'mammo' },
    });
    const groups = groupInstancesBySplitRules(
      [
        {
          SeriesInstanceUID: 's',
          SOPInstanceUID: '1',
          ImageType: ['DERIVED', 'TOMO'],
        },
        {
          SeriesInstanceUID: 's',
          SOPInstanceUID: '2',
          ImageType: ['ORIGINAL'],
        },
      ],
      rules
    );
    expect(groups.map((group) => JSON.parse(group.splitKey)[0])).toEqual([
      'tomo',
      'legacy',
    ]);
  });
});

describe('the default rules - a mixed series', () => {
  it('tests each instance: a still image after a clip is not a clip', () => {
    const US_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.6.1';
    expect(
      ruleIdsFor([
        instance({
          SOPClassUID: US_MULTIFRAME_SOP_CLASS,
          Modality: 'US',
          SOPInstanceUID: 'clip',
          InstanceNumber: 1,
          NumberOfFrames: 30,
          SliceLocation: 0,
        }),
        instance({
          SOPClassUID: US_SOP_CLASS,
          Modality: 'US',
          SOPInstanceUID: 'still',
          InstanceNumber: 2,
        }),
      ])
    ).toEqual(['multiFrame', 'defaultImageRule']);
  });
});

describe('code entries of the context', () => {
  const ct = [instance({ SOPInstanceUID: 'a', InstanceNumber: 1 })];

  it('gives a rule code entry that reads its own name the global value', () => {
    const rule = {
      context: {
        isImage: (i: NaturalizedInstance, values: Record<string, unknown>) =>
          values.isImage === true && i.Modality === 'CT',
      },
      matches: { isImage: true },
    };
    expect(claimed(rule, ct)).toEqual(['a']);
  });

  it('stops a loop through a code entry at the first read, and names each entry', () => {
    const options = {
      context: {
        first: (_i: NaturalizedInstance, values: Record<string, unknown>) =>
          values.second,
        second: 'third',
        third: 'first == true',
      },
    };
    expect(() => claimed({ matches: { first: true } }, ct, options)).toThrow(
      'the context entries form a loop: first -> second -> third -> first'
    );
  });
});

describe('the deny list of the host', () => {
  const options = {
    deniedNames: ['PatientName'],
    context: {
      nameOf: (_i: NaturalizedInstance, values: Record<string, unknown>) =>
        values.PatientName,
    },
  };

  it('rejects a rule that names a denied name, and gives a code entry no value', () => {
    expectRejected(
      { matches: { PatientName: 'X' } },
      "rule 'r'.matches.PatientName",
      "'PatientName'",
      options
    );
    expectRejected(
      { attributes: { label: { template: '{PatientName}' } } },
      "rule 'r'.attributes.label.template",
      "'PatientName'",
      options
    );
    expect(
      claimed(
        { matches: { nameOf: null } },
        [instance({ SOPInstanceUID: 'p', PatientName: 'Doe^J' })],
        options
      )
    ).toEqual(['p']);
  });

  it('rejects a declaration of a denied attribute, by keyword or by hex tag', () => {
    for (const attribute of ['PatientName', '00100010', 'x00100010']) {
      expectRejected(
        {
          context: { pn: { attribute } },
          attributes: { SeriesDescription: { template: 'leak {pn}' } },
        },
        "rule 'r'.context.pn.attribute",
        'deny list',
        options
      );
    }
  });

  it('rejects a field of a sequence item that is denied, also a computed field', () => {
    const denyId = { deniedNames: ['PatientID'] };
    for (const expression of [
      "'x' + OtherPatientIDsSequence[0].PatientID",
      "'x' + OtherPatientIDsSequence[0]['PatientID']",
      "'x' + OtherPatientIDsSequence[0]['Patient' + 'ID']",
    ]) {
      expectRejected(
        { attributes: { label: { expression } } },
        "rule 'r'.attributes.label.expression",
        'deny list',
        denyId
      );
    }
    // A literal index and a field that is not denied still compile.
    expect(() =>
      compileOne({ context: { view: 'ViewCodeSequence[0].CodeValue' } }, denyId)
    ).not.toThrow();
  });
});

describe('expressions and names: the DICOM rule for no value', () => {
  it('gives no value for arithmetic on an empty value, so a test on it fails', () => {
    const rule = {
      context: { pixelCount: 'Rows * Columns' },
      matches: { pixelCount: { lessThan: 100 } },
    };
    expect(
      claimed(rule, [
        instance({ SOPInstanceUID: 'empty', Rows: null as unknown as number }),
      ])
    ).toEqual([]);
  });

  it('reads an array of empty elements as no value', () => {
    const rule = { matches: { ImageType: { notNull: true } } };
    expect(
      claimed(rule, [instance({ SOPInstanceUID: 'x', ImageType: [''] })])
    ).toEqual([]);
  });

  it('rejects a field on a keyword, and an index on a group', () => {
    expectRejected(
      { attributes: { label: { template: '{Modality.foo}' } } },
      "rule 'r'.attributes.label.template",
      "'foo'"
    );
    expectRejected(
      { context: { s: "timeClusters['start']" } },
      "rule 'r'.context.s",
      "'timeClusters'"
    );
  });

  it('sorts an instance with no value after the instances with a value', () => {
    const [group] = groupInstancesBySplitRules(
      [2, undefined, 1].map((SliceLocation, index) =>
        instance({
          SOPInstanceUID: `s${index}`,
          InstanceNumber: index,
          SliceLocation,
        })
      ),
      compileOne({ sortBy: ['SliceLocation'] })
    );
    expect(group.instances.map((i) => i.SliceLocation)).toEqual([
      1,
      2,
      undefined,
    ]);
  });
});
