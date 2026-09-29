import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { defaultDisplaySetSplitRules } from './defaultDisplaySetSplitRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
} from './rawDisplaySetSelector';
import type {
  RawDisplaySetSelector,
  RawSplitRule,
} from './rawDisplaySetSelectorTypes';
import { resolveSplitRuleSet } from './splitRuleSet';
import type { NaturalizedInstance } from './types';

/**
 * A keyed raw selector from rules listed in evaluation order: each rule's id is
 * its key, and its position gives its priority. For tests whose point is not
 * the shape of the selector.
 */
const raw = (
  ...rules: (Omit<RawSplitRule, 'priority'> & { id: string })[]
): RawDisplaySetSelector =>
  Object.fromEntries(
    rules.map(({ id, ...rule }, index) => [
      id,
      { ...rule, priority: index + 1 },
    ])
  );

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

  it('keys every rule by its id, so keys survive editing the selector', () => {
    for (const [id, rule] of Object.entries(rawDisplaySetSelector)) {
      // The key is the id. A rule that also states an id must agree with it.
      expect(rule.id ?? id).toBe(id);
    }
  });

  it('gives the defaults the priorities 1..n in their documented order', () => {
    const entries = Object.entries(rawDisplaySetSelector);
    expect(entries.map(([id, rule]) => [id, rule.priority])).toEqual([
      ['video', 1],
      ['ecg', 2],
      ['wholeslide', 3],
      ['singleImageModality', 4],
      ['multiFrame', 5],
      ['mixedDimensionalityBValue', 6],
      ['volume3d', 7],
      ['defaultImageRule', 8],
      ['unsupported', 9],
    ]);
    expect(
      resolveSplitRuleSet(defaultDisplaySetSplitRules).map((rule) => rule.id)
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

  it('yields to an application rule with a lower priority', () => {
    // This is how an application that *does* support SEG opts in.
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      seg: {
        priority: -1,
        viewportTypes: ['stack'],
        matches: { attribute: 'Modality', equals: 'SEG' },
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
    const priorities = Object.values(rawDisplaySetSelector).map(
      (rule) => rule.priority as number
    );
    expect(rawDisplaySetSelector.unsupported.priority).toBe(
      Math.max(...priorities)
    );
    // A rule with no `matches` claims everything, so any later rule is dead code.
    const catchAlls = Object.entries(rawDisplaySetSelector).filter(
      ([, rule]) => !rule.matches
    );
    expect(catchAlls.map(([id]) => id)).toEqual(['unsupported']);
  });

  it('lets a fallback rule run between defaultImageRule and unsupported', () => {
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      segFallback: {
        priority: 8.5,
        matches: { attribute: 'Modality', equals: 'SEG' },
      },
    });

    expect(
      ruleIdsFor(
        [
          instance({
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
            Modality: 'SEG',
          }),
          instance({
            SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33',
            Modality: 'SR',
          }),
        ],
        rules
      )
    ).toEqual(['segFallback', 'unsupported']);
  });

  it('can be excluded with a null priority', () => {
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      unsupported: { ...rawDisplaySetSelector.unsupported, priority: null },
    });
    const unmatched: NaturalizedInstance[] = [];

    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33',
          Modality: 'SR',
        }),
      ],
      rules,
      (i) => unmatched.push(i)
    );

    expect(groups).toEqual([]);
    expect(unmatched.length).toBe(1);
  });
});

describe('createDisplaySetSplitRules - the condition vocabulary', () => {
  const rules = (matches: unknown) =>
    createDisplaySetSplitRules(
      raw({ id: 'probe', matches } as never, { id: 'rest' })
    );

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

  it('supports contains, case sensitive by default', () => {
    const description = { SeriesDescription: '4D Flow SAX' };
    expect(
      claimed({ attribute: 'SeriesDescription', contains: 'Flow' }, description)
    ).toBe('probe');
    // Case matters unless asked otherwise - a case-insensitive 'de' would sweep
    // in far more than delayed-enhancement series.
    expect(
      claimed({ attribute: 'SeriesDescription', contains: 'flow' }, description)
    ).toBe('rest');
    expect(
      claimed(
        {
          attribute: 'SeriesDescription',
          contains: 'flow',
          ignoreCase: true,
        },
        description
      )
    ).toBe('probe');
  });

  it('supports containsAny', () => {
    const description = { SeriesDescription: 'PSIR LGE stack' };
    expect(
      claimed(
        { attribute: 'SeriesDescription', containsAny: ['LGE', 'MAG'] },
        description
      )
    ).toBe('probe');
    expect(
      claimed(
        { attribute: 'SeriesDescription', containsAny: ['T2', 'CINE'] },
        description
      )
    ).toBe('rest');
  });

  it('never matches contains on an absent attribute', () => {
    expect(claimed({ attribute: 'SeriesDescription', contains: 'flow' })).toBe(
      'rest'
    );
  });
});

describe('createDisplaySetSplitRules - templates', () => {
  const readTemplate = (template: string, overrides = {}) => {
    const rules = createDisplaySetSplitRules(
      raw({
        id: 'templated',
        customAttributes: { fromFirstInstance: { label: { template } } },
      } as never)
    );
    const inst = instance(overrides);
    return rules.templated.customAttributes?.(
      { instance: inst },
      { instances: [inst] }
    ).label;
  };

  it('substitutes attribute placeholders', () => {
    expect(
      readTemplate('US series {InstanceNumber}', { InstanceNumber: 7 })
    ).toBe('US series 7');
  });

  it('substitutes several placeholders and keeps the literals', () => {
    expect(
      readTemplate('{Modality}/{SeriesDescription} end', {
        SeriesDescription: 'SAX',
      })
    ).toBe('CT/SAX end');
  });

  it('substitutes an absent attribute as an empty string', () => {
    expect(readTemplate('[{ImageComments}]')).toBe('[]');
  });

  it('honours escaped braces', () => {
    expect(readTemplate('\\{literal\\} {Modality}')).toBe('{literal} CT');
  });

  it('rejects an unclosed or empty placeholder at compile time', () => {
    expect(() => readTemplate('{Modality')).toThrow(/unclosed/);
    expect(() => readTemplate('{}')).toThrow(/empty/);
  });
});

describe('rawDisplaySetSelector - rule metadata', () => {
  it('gives every standard rule a description a UI can display', () => {
    // A rules UI reads the explanation from the rule itself rather than keeping
    // its own copy, so a rule without one shows up as blank.
    const undocumented = Object.entries(rawDisplaySetSelector).filter(
      ([, rule]) => !rule.description
    );
    expect(undocumented.map(([id]) => id)).toEqual([]);
  });

  it('keeps descriptions out of the compiled rules', () => {
    // The split engine has no use for prose; it should not end up in the
    // compiled predicate objects.
    const compiled = createDisplaySetSplitRules(rawDisplaySetSelector);
    expect(
      Object.values(compiled).some((rule) => 'description' in (rule as object))
    ).toBe(false);
  });
});

describe('createDisplaySetSplitRules - the keyed result', () => {
  const selector: RawDisplaySetSelector = {
    catchAll: { priority: 2 },
    ctRule: { priority: 1, matches: { attribute: 'Modality', equals: 'CT' } },
    off: { priority: null, matches: { attribute: 'Modality', equals: 'MR' } },
  };

  it('keeps the keys and the priorities of the selector', () => {
    const compiled = createDisplaySetSplitRules(selector);

    expect(Object.keys(compiled).sort()).toEqual(['catchAll', 'ctRule', 'off']);
    expect(compiled.catchAll.priority).toBe(2);
    expect(compiled.ctRule.priority).toBe(1);
    expect(compiled.ctRule.matches?.(instance(), { series: {} })).toBe(true);
    expect(
      compiled.ctRule.matches?.(instance({ Modality: 'MR' }), { series: {} })
    ).toBe(false);
  });

  it('compiles and keeps an excluded entry, so a later layer can include it', () => {
    const compiled = createDisplaySetSplitRules(selector);

    expect(compiled.off.priority).toBeNull();
    expect(
      compiled.off.matches?.(instance({ Modality: 'MR' }), { series: {} })
    ).toBe(true);
    expect(resolveSplitRuleSet(compiled).map((rule) => rule.id)).toEqual([
      'ctRule',
      'catchAll',
    ]);

    const included = resolveSplitRuleSet({
      ...compiled,
      off: { ...compiled.off, priority: 0 },
    });
    expect(included.map((rule) => rule.id)).toEqual([
      'off',
      'ctRule',
      'catchAll',
    ]);
  });

  it('gives the compiled defaults the same keys and priorities as the selector', () => {
    expect(
      Object.entries(defaultDisplaySetSplitRules).map(([id, rule]) => [
        id,
        rule.priority,
      ])
    ).toEqual(
      Object.entries(rawDisplaySetSelector).map(([id, rule]) => [
        id,
        rule.priority,
      ])
    );
  });
});

describe('createDisplaySetSplitRules - series facts', () => {
  const factRules = (fact: unknown) =>
    createDisplaySetSplitRules(
      raw(
        {
          id: 'probe',
          series: [fact],
          matches: { seriesFact: 'flag' },
        } as never,
        { id: 'rest' }
      )
    );

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
    const rules = createDisplaySetSplitRules(
      raw({
        id: 'usRuns',
        matches: { attribute: 'Modality', equals: 'US' },
        runBy: { condition: { attribute: 'NumberOfFrames', greaterThan: 1 } },
      })
    );

    // singles, clip, singles -> three display sets rather than two.
    expect(groupInstancesBySplitRules(interleaved, rules).length).toBe(3);
  });

  it('orders a group from a declarative compareInstances', () => {
    const rules = createDisplaySetSplitRules(
      raw({
        id: 'byLocation',
        matches: { attribute: 'Modality', equals: 'CT' },
        compareInstances: { attribute: 'SliceLocation', number: true },
      })
    );

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
    const rules = createDisplaySetSplitRules(
      raw({
        id: 'byLocationDesc',
        matches: { attribute: 'Modality', equals: 'CT' },
        compareInstances: {
          attribute: 'SliceLocation',
          number: true,
          descending: true,
        },
      })
    );

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
      raw(
        { id: 'special', matches: { classifier: 'siteSpecific' } },
        { id: 'rest' }
      ),
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
      raw({ id: 'img', matches: { classifier: 'image' } }, { id: 'rest' }),
      { classifiers: { image: () => false } }
    );

    expect(
      groupInstancesBySplitRules([instance()], rules)[0].matchedRule.id
    ).toBe('rest');
  });

  it('applies a named customAttributes preset over the declarative fields', () => {
    const rules = createDisplaySetSplitRules(
      raw({
        id: 'preset',
        customAttributes: { set: { label: 'declarative' }, preset: 'site' },
      }),
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
      rules.preset.customAttributes?.(
        { instance: instance() },
        { instances: [instance()], splitNumber: 1 }
      )
    ).toEqual({ label: 'preset', count: 1, splitNumber: 1 });
  });
});

describe('createDisplaySetSplitRules - validation', () => {
  it('rejects a selector that is not an object keyed by rule id', () => {
    expect(createDisplaySetSplitRules({})).toEqual({});
    expect(() => createDisplaySetSplitRules('rules' as never)).toThrow(
      /Invalid raw display set selector: selector must be an object keyed by rule id/
    );
    // The array form is gone.
    expect(() =>
      createDisplaySetSplitRules([{ id: 'x', priority: 1 }] as never)
    ).toThrow(/selector must be an object keyed by rule id/);
  });

  it('rejects an entry whose id differs from its key', () => {
    expect(() =>
      createDisplaySetSplitRules({ key: { id: 'other', priority: 1 } })
    ).toThrow(/"key".*states id "other"/);
  });

  it('rejects an entry with no priority', () => {
    expect(() => createDisplaySetSplitRules({ x: {} as never })).toThrow(
      /"x".*priority must be a finite number/
    );
  });

  it('rejects an unknown classifier at compile time, not at split time', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', matches: { classifier: 'nope' } } as never)
      )
    ).toThrow(/unknown classifier "nope"/);
  });

  it('rejects an attribute condition with no operator', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', matches: { attribute: 'Rows' } } as never)
      )
    ).toThrow(/no operator for attribute "Rows"/);
  });

  it('rejects an unrecognized condition', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', matches: { nonsense: true } } as never)
      )
    ).toThrow(/unrecognized condition/);
  });

  it('rejects an unknown series fact scope', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({
          id: 'x',
          series: [{ name: 'f', scope: 'most', when: { all: [] } }],
        } as never)
      )
    ).toThrow(/unknown scope/);
  });

  it('rejects a zero bucket', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', groupBy: [{ attribute: 'Rows', bucket: 0 }] } as never)
      )
    ).toThrow(/bucket must be a non-zero finite number/);
  });

  it('rejects an unknown customAttributes preset', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', customAttributes: { preset: 'missing' } } as never)
      )
    ).toThrow(/unknown customAttributes preset "missing"/);
  });

  it('names the offending fragment in the error', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'x', matches: { classifier: 'nope' } } as never)
      )
    ).toThrow(/\{"classifier":"nope"\}/);
  });
});

describe('rawDisplaySetSelector - rules written as expressions', () => {
  it('accepts a string expression as a rule matcher', () => {
    // The whole point of the expression language: the condition reads as one
    // line instead of a nested object tree, and still crosses the wire as JSON.
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      bigCt: {
        priority: -1,
        viewportTypes: ['stack'],
        matches: "Modality === 'CT' && Rows > 256",
      },
    });

    expect(
      ruleIdsFor([instance({ Rows: 512 }), instance({ Rows: 128 })], rules)
    ).toEqual(['bigCt', 'volume3d']);
  });

  it('accepts the { expression } object form for the same condition', () => {
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      mg: {
        priority: -1,
        viewportTypes: ['stack'],
        matches: { expression: "Modality in ['CR', 'DX', 'MG']" },
      },
    });

    expect(
      ruleIdsFor([instance({ Modality: 'MG', Rows: 2294 })], rules)
    ).toEqual(['mg']);
  });

  it('groups by a computed expression value', () => {
    // In value position an expression yields its own result rather than a
    // boolean, so it can produce a bucket key no attribute carries directly.
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      byLaterality: {
        priority: -1,
        viewportTypes: ['stack'],
        matches: "Modality === 'MG'",
        groupBy: [
          'SeriesInstanceUID',
          {
            expression:
              "ImageLaterality + '-' + (Rows > 2000 ? 'big' : 'small')",
          },
        ],
      },
    });

    const groups = groupInstancesBySplitRules(
      [
        instance({ Modality: 'MG', Rows: 2294, ImageLaterality: 'L' }),
        instance({ Modality: 'MG', Rows: 2294, ImageLaterality: 'R' }),
        instance({ Modality: 'MG', Rows: 1024, ImageLaterality: 'R' }),
      ],
      rules
    );

    expect(groups.length).toBe(3);
    expect(
      groups.every((group) => group.matchedRule.id === 'byLaterality')
    ).toBe(true);
  });

  it('reports an expression syntax error at compile time', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'bad', matches: 'Modality ===' } as never)
      )
    ).toThrow(/Modality ===/);
  });

  it('refuses prototype-chain access from an expression', () => {
    expect(() =>
      createDisplaySetSplitRules(
        raw({ id: 'evil', matches: 'instance.constructor' } as never)
      )
    ).toThrow(/constructor/);
  });
});
