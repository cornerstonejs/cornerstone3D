import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { defaultDisplaySetSplitRules } from './defaultDisplaySetSplitRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
} from './rawDisplaySetSelector';
import type { NaturalizedInstance } from './types';

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
    rules ?? defaultDisplaySetSplitRules
  ).map((group) => group.matchedRule.id);
}

describe('rawDisplaySetSelector - the selector as data', () => {
  it('is pure JSON: survives a stringify/parse round trip', () => {
    // The whole point of the raw form is that it can cross a process boundary
    // (server index -> client viewer) as JSON, so it must contain no functions.
    const roundTripped = JSON.parse(JSON.stringify(rawDisplaySetSelector));

    expect(roundTripped).toEqual(rawDisplaySetSelector);
  });

  it('compiles the same rules after a JSON round trip', () => {
    const instances = [
      instance({ SOPInstanceUID: 'a', InstanceNumber: 1 }),
      instance({ SOPInstanceUID: 'b', InstanceNumber: 2 }),
    ];

    const overTheWire = createDisplaySetSplitRules(
      JSON.parse(JSON.stringify(rawDisplaySetSelector))
    );

    const local = groupInstancesBySplitRules(
      instances,
      defaultDisplaySetSplitRules
    );
    const remote = groupInstancesBySplitRules(instances, overTheWire);

    expect(remote.map((g) => g.matchedRule.id)).toEqual(
      local.map((g) => g.matchedRule.id)
    );
    expect(remote.map((g) => g.splitKey)).toEqual(local.map((g) => g.splitKey));
  });

  it('gives every rule an id, so keys survive editing the selector', () => {
    expect(rawDisplaySetSelector.every((rule) => Boolean(rule.id))).toBe(true);
    expect(new Set(rawDisplaySetSelector.map((r) => r.id)).size).toBe(
      rawDisplaySetSelector.length
    );
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

  it('splits differently sized MG images into separate stacks', () => {
    const groups = groupInstancesBySplitRules(
      [
        instance({
          Modality: 'MG',
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.1.2',
          SOPInstanceUID: 'mg-small',
          Rows: 512,
          Columns: 512,
        }),
        instance({
          Modality: 'MG',
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.1.2',
          SOPInstanceUID: 'mg-large',
          Rows: 2048,
          Columns: 2048,
        }),
      ],
      defaultDisplaySetSplitRules
    );

    expect(groups.length).toBe(2);
    // The joined groupBy part keeps the bucket readable in the key.
    expect(groups.map((g) => g.splitKey).join(' ')).toContain('rows=8&cols=8');
    expect(groups.map((g) => g.splitKey).join(' ')).toContain(
      'rows=32&cols=32'
    );
  });

  it('treats a multi-frame instance with a slice location as a clip', () => {
    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: US_MULTIFRAME_SOP_CLASS,
          Modality: 'US',
          SOPInstanceUID: 'clip',
          NumberOfFrames: 30,
          SliceLocation: 12,
          InstanceNumber: 1,
        }),
      ],
      defaultDisplaySetSplitRules
    );

    expect(groups[0].matchedRule.id).toBe('multiFrame');
    // NumberOfFrames arrives as a string as readily as a number.
    expect(
      groups[0].matchedRule.customAttributes?.(
        { instance: groups[0].instances[0], isMultiFrame: true },
        { instances: groups[0].instances, splitNumber: 2 }
      )
    ).toEqual({
      isClip: true,
      numImageFrames: 30,
      isMultiFrame: true,
      splitNumber: 2,
    });
  });

  it('does not treat a multi-frame instance without a slice location as a clip', () => {
    expect(
      ruleIdsFor([
        instance({
          SOPClassUID: US_MULTIFRAME_SOP_CLASS,
          Modality: 'US',
          SOPInstanceUID: 'no-slice',
          NumberOfFrames: 30,
        }),
      ])
    ).toEqual(['defaultImageRule']);
  });

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
      defaultDisplaySetSplitRules
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
      groupInstancesBySplitRules(instances, defaultDisplaySetSplitRules).length
    ).toBe(2);
  });

  it('matches an attribute value delivered as a numeric string', () => {
    // NumberOfFrames as '30' must still be > 1.
    expect(
      ruleIdsFor([
        instance({
          SOPClassUID: US_MULTIFRAME_SOP_CLASS,
          Modality: 'US',
          SOPInstanceUID: 'string-frames',
          NumberOfFrames: '30' as unknown as number,
          SliceLocation: 4,
        }),
      ])
    ).toEqual(['multiFrame']);
  });

  it('surfaces a non-image instance through the catch-all', () => {
    expect(
      ruleIdsFor([
        instance({
          // Comprehensive SR - no pixel data, so no image rule claims it. The
          // catch-all still surfaces it rather than dropping it.
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33',
          Modality: 'SR',
          Rows: undefined,
        }),
      ])
    ).toEqual(['unsupported']);
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

describe('default rules - the unsupported catch-all', () => {
  const NON_IMAGE_SOP_CLASSES: [string, string, string][] = [
    ['Segmentation', '1.2.840.10008.5.1.4.1.1.66.4', 'SEG'],
    ['Labelmap Segmentation', '1.2.840.10008.5.1.4.1.1.66.7', 'SEG'],
    ['RT Structure Set', '1.2.840.10008.5.1.4.1.1.481.3', 'RTSTRUCT'],
    ['RT Dose', '1.2.840.10008.5.1.4.1.1.481.2', 'RTDOSE'],
    ['RT Plan', '1.2.840.10008.5.1.4.1.1.481.5', 'RTPLAN'],
    ['Comprehensive SR', '1.2.840.10008.5.1.4.1.1.88.33', 'SR'],
    ['Encapsulated PDF', '1.2.840.10008.5.1.4.1.1.104.1', 'DOC'],
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
      defaultDisplaySetSplitRules
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
    const displaySet = displaySetFor('1.2.840.10008.5.1.4.1.1.66.4', 'SEG');

    expect(displaySet.isDisplayable).toBe(false);
    expect(displaySet.viewportTypes).toEqual(['none']);
    // A consumer switching on the preferred type is told 'none', not 'stack'.
    expect(displaySet.preferredViewportType).toBe('none');
  });

  it('records what it could not render, so a consumer can say which kind', () => {
    const displaySet = displaySetFor(
      '1.2.840.10008.5.1.4.1.1.481.3',
      'RTSTRUCT'
    );

    expect(displaySet.sopClassUids).toEqual(['1.2.840.10008.5.1.4.1.1.481.3']);
    expect(displaySet.instances[0].Modality).toBe('RTSTRUCT');
  });

  it('advertises no renderable imageIds but stays resolvable by imageId', () => {
    const displaySet = displaySetFor('1.2.840.10008.5.1.4.1.1.88.33', 'SR');

    // Empty imageIds: anything that ignores isDisplayable renders nothing rather
    // than treating a document as a one-frame image stack.
    expect(displaySet.imageIds).toEqual([]);
    expect(displaySet.underlyingImageIds).toEqual(['wadors:/obj-1']);
  });

  it('produces one display set per object, not one per series', () => {
    // Two SEGs of one series are two documents, and must not be conflated.
    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          Modality: 'SEG',
          SOPInstanceUID: 'seg-1',
          InstanceNumber: 1,
        }),
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          Modality: 'SEG',
          SOPInstanceUID: 'seg-2',
          InstanceNumber: 2,
        }),
      ],
      defaultDisplaySetSplitRules
    );

    expect(groups.length).toBe(2);
  });

  it('surfaces an image whose Rows have not loaded yet', () => {
    // Every image rule requires Rows, so an incompletely loaded instance would
    // otherwise vanish without explanation.
    expect(
      ruleIdsFor([instance({ SOPInstanceUID: 'ct-no-rows', Rows: undefined })])
    ).toEqual(['unsupported']);
  });

  it('yields to an application rule placed before it', () => {
    // This is how an application that *does* support SEG opts in.
    const rules = createDisplaySetSplitRules([
      {
        id: 'seg',
        viewportTypes: ['stack'],
        matches: { attribute: 'Modality', equals: 'SEG' },
      },
      ...rawDisplaySetSelector,
    ]);

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

  it('is the last rule, so it never shadows a real one', () => {
    expect(rawDisplaySetSelector[rawDisplaySetSelector.length - 1].id).toBe(
      'unsupported'
    );
    // A rule with no `matches` claims everything, so any later rule is dead code.
    const catchAlls = rawDisplaySetSelector.filter((rule) => !rule.matches);
    expect(catchAlls.map((rule) => rule.id)).toEqual(['unsupported']);
  });
});

describe('createDisplaySetSplitRules - the condition vocabulary', () => {
  const rules = (matches: unknown) =>
    createDisplaySetSplitRules([
      { id: 'probe', matches } as never,
      { id: 'rest' },
    ]);

  const claimed = (matches: unknown, overrides = {}) =>
    groupInstancesBySplitRules([instance(overrides)], rules(matches))[0]
      .matchedRule.id;

  it('supports exists / absent', () => {
    expect(claimed({ attribute: 'SliceLocation', exists: true })).toBe('rest');
    expect(claimed({ attribute: 'SliceLocation', absent: true })).toBe('probe');
    expect(
      claimed(
        { attribute: 'SliceLocation', exists: true },
        { SliceLocation: 3 }
      )
    ).toBe('probe');
  });

  it('supports equals / notEquals across string and number forms', () => {
    expect(claimed({ attribute: 'Rows', equals: 512 })).toBe('probe');
    expect(claimed({ attribute: 'Rows', equals: '512' })).toBe('probe');
    expect(claimed({ attribute: 'Rows', notEquals: 512 })).toBe('rest');
  });

  it('supports in / notIn', () => {
    expect(claimed({ attribute: 'Modality', in: ['CT', 'MR'] })).toBe('probe');
    expect(claimed({ attribute: 'Modality', notIn: ['CT', 'MR'] })).toBe(
      'rest'
    );
  });

  it('supports greaterThan / lessThan, and never matches an absent attribute', () => {
    expect(claimed({ attribute: 'Rows', greaterThan: 100 })).toBe('probe');
    expect(claimed({ attribute: 'Rows', lessThan: 100 })).toBe('rest');
    expect(claimed({ attribute: 'NumberOfFrames', greaterThan: -1 })).toBe(
      'rest'
    );
  });

  it('supports all / any / not, with all: [] true and any: [] false', () => {
    expect(claimed({ all: [] })).toBe('probe');
    expect(claimed({ any: [] })).toBe('rest');
    expect(claimed({ not: { attribute: 'Rows', equals: 512 } })).toBe('rest');
    expect(
      claimed({
        any: [
          { attribute: 'Modality', equals: 'XX' },
          { attribute: 'Modality', equals: 'CT' },
        ],
      })
    ).toBe('probe');
  });

  it('supports named classifiers', () => {
    expect(claimed({ classifier: 'image' })).toBe('probe');
    expect(claimed({ classifier: 'video' })).toBe('rest');
  });
});

describe('createDisplaySetSplitRules - series facts', () => {
  const factRules = (fact: unknown) =>
    createDisplaySetSplitRules([
      {
        id: 'probe',
        series: [fact],
        matches: { seriesFact: 'flag' },
      } as never,
      { id: 'rest' },
    ]);

  const matchedIds = (fact: unknown, instances: NaturalizedInstance[]) =>
    new Set(
      groupInstancesBySplitRules(instances, factRules(fact)).map(
        (g) => g.matchedRule.id
      )
    );

  const two = [
    instance({ SOPInstanceUID: 'a', InstanceNumber: 1, Modality: 'CT' }),
    instance({ SOPInstanceUID: 'b', InstanceNumber: 2, Modality: 'MR' }),
  ];

  it('scope first samples instances[0] only', () => {
    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'first',
          when: { attribute: 'Modality', equals: 'CT' },
        },
        two
      )
    ).toEqual(new Set(['probe']));
  });

  it('scope every requires all instances', () => {
    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'every',
          when: { attribute: 'Modality', equals: 'CT' },
        },
        two
      )
    ).toEqual(new Set(['rest']));
  });

  it('scope some requires at least one', () => {
    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'some',
          when: { attribute: 'Modality', equals: 'MR' },
        },
        two
      )
    ).toEqual(new Set(['probe']));
  });

  it('scope mixed requires both kinds present', () => {
    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'mixed',
          when: { attribute: 'Modality', equals: 'CT' },
        },
        two
      )
    ).toEqual(new Set(['probe']));
    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'mixed',
          when: { attribute: 'Modality', exists: true },
        },
        two
      )
    ).toEqual(new Set(['rest']));
  });

  it('honours gate and minInstances', () => {
    expect(
      matchedIds(
        {
          name: 'flag',
          gate: { attribute: 'Modality', equals: 'MR' },
          scope: 'first',
          when: { attribute: 'Rows', exists: true },
        },
        two
      )
    ).toEqual(new Set(['rest']));

    expect(
      matchedIds(
        {
          name: 'flag',
          scope: 'first',
          when: { attribute: 'Rows', exists: true },
          minInstances: 3,
        },
        two
      )
    ).toEqual(new Set(['rest']));
  });
});

describe('createDisplaySetSplitRules - runBy and compareInstances as data', () => {
  const interleaved = [
    instance({ SOPInstanceUID: 'i1', InstanceNumber: 1, Modality: 'US' }),
    instance({ SOPInstanceUID: 'i2', InstanceNumber: 2, Modality: 'US' }),
    instance({
      SOPInstanceUID: 'c3',
      InstanceNumber: 3,
      Modality: 'US',
      NumberOfFrames: 30,
    }),
    instance({ SOPInstanceUID: 'i4', InstanceNumber: 4, Modality: 'US' }),
  ];

  it('splits runs from a declarative runBy condition', () => {
    const rules = createDisplaySetSplitRules([
      {
        id: 'usRuns',
        matches: { attribute: 'Modality', equals: 'US' },
        runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
      },
    ]);

    // singles, clip, singles -> three display sets rather than two.
    expect(groupInstancesBySplitRules(interleaved, rules).length).toBe(3);
  });

  it('orders a group from a declarative compareInstances', () => {
    const rules = createDisplaySetSplitRules([
      {
        id: 'byLocation',
        matches: { attribute: 'Modality', equals: 'CT' },
        compareInstances: { attribute: 'SliceLocation', number: true },
      },
    ]);

    const groups = groupInstancesBySplitRules(
      [
        instance({ SOPInstanceUID: 'a', InstanceNumber: 1, SliceLocation: 20 }),
        instance({ SOPInstanceUID: 'b', InstanceNumber: 2, SliceLocation: 10 }),
      ],
      rules
    );

    expect(groups[0].instances.map((i) => i.SOPInstanceUID)).toEqual([
      'b',
      'a',
    ]);
  });

  it('reverses that order with descending', () => {
    const rules = createDisplaySetSplitRules([
      {
        id: 'byLocationDesc',
        matches: { attribute: 'Modality', equals: 'CT' },
        compareInstances: {
          attribute: 'SliceLocation',
          number: true,
          descending: true,
        },
      },
    ]);

    const groups = groupInstancesBySplitRules(
      [
        instance({ SOPInstanceUID: 'a', InstanceNumber: 1, SliceLocation: 20 }),
        instance({ SOPInstanceUID: 'b', InstanceNumber: 2, SliceLocation: 10 }),
      ],
      rules
    );

    expect(groups[0].instances.map((i) => i.SOPInstanceUID)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('createDisplaySetSplitRules - extension points', () => {
  it('accepts application-supplied classifiers', () => {
    const rules = createDisplaySetSplitRules(
      [
        { id: 'special', matches: { classifier: 'siteSpecific' } },
        { id: 'rest' },
      ],
      {
        classifiers: {
          siteSpecific: (i) => i.SeriesDescription === 'SITE',
        },
      }
    );

    expect(
      groupInstancesBySplitRules(
        [instance({ SeriesDescription: 'SITE' })],
        rules
      )[0].matchedRule.id
    ).toBe('special');
  });

  it('lets a supplied classifier override a built-in one', () => {
    const rules = createDisplaySetSplitRules(
      [{ id: 'img', matches: { classifier: 'image' } }, { id: 'rest' }],
      { classifiers: { image: () => false } }
    );

    expect(
      groupInstancesBySplitRules([instance()], rules)[0].matchedRule.id
    ).toBe('rest');
  });

  it('applies a named customAttributes preset over the declarative fields', () => {
    const rules = createDisplaySetSplitRules(
      [
        {
          id: 'preset',
          customAttributes: { set: { label: 'declarative' }, preset: 'site' },
        },
      ],
      {
        customAttributePresets: {
          site: (instances, { splitNumber }) => ({
            label: 'preset',
            count: instances.length,
            splitNumber,
          }),
        },
      }
    );

    expect(
      rules[0].customAttributes?.(
        { instance: instance() },
        { instances: [instance()], splitNumber: 1 }
      )
    ).toEqual({ label: 'preset', count: 1, splitNumber: 1 });
  });
});

describe('createDisplaySetSplitRules - validation', () => {
  it('rejects a non-array selector', () => {
    expect(() => createDisplaySetSplitRules({} as never)).toThrow(
      /must be an array of rules/
    );
  });

  it('rejects a rule with no id', () => {
    expect(() => createDisplaySetSplitRules([{} as never])).toThrow(
      /rule requires an id/
    );
  });

  it('rejects an unknown classifier at compile time, not at split time', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', matches: { classifier: 'nope' } } as never,
      ])
    ).toThrow(/unknown classifier "nope"/);
  });

  it('rejects an attribute condition with no operator', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', matches: { attribute: 'Rows' } } as never,
      ])
    ).toThrow(/no operator for attribute "Rows"/);
  });

  it('rejects an unrecognized condition', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', matches: { nonsense: true } } as never,
      ])
    ).toThrow(/unrecognized condition/);
  });

  it('rejects an unknown series fact scope', () => {
    expect(() =>
      createDisplaySetSplitRules([
        {
          id: 'x',
          series: [{ name: 'f', scope: 'most', when: { all: [] } }],
        } as never,
      ])
    ).toThrow(/unknown scope/);
  });

  it('rejects a zero bucket', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', groupBy: [{ attribute: 'Rows', bucket: 0 }] } as never,
      ])
    ).toThrow(/bucket must be a non-zero finite number/);
  });

  it('rejects an unknown customAttributes preset', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', customAttributes: { preset: 'missing' } } as never,
      ])
    ).toThrow(/unknown customAttributes preset "missing"/);
  });

  it('names the offending fragment in the error', () => {
    expect(() =>
      createDisplaySetSplitRules([
        { id: 'x', matches: { classifier: 'nope' } } as never,
      ])
    ).toThrow(/\{"classifier":"nope"\}/);
  });
});
