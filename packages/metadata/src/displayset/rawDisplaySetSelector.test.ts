import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { defaultDisplaySetSplitRules } from './defaultDisplaySetSplitRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import {
  createDisplaySetSplitRules,
  rawDisplaySetSelector,
} from './rawDisplaySetSelector';
import type { RawDisplaySetSelector } from './rawDisplaySetSelectorTypes';
import { resolveSplitRuleSet } from './splitRuleSet';
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

  it('gives the defaults the priorities 1..n, and runs the catch-all last', () => {
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
      ['unsupported', Number.MAX_SAFE_INTEGER],
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

  it('produces one display set for each series, with the SOP classes it holds', () => {
    // A series of many presentation states must be one entry, not one per object.
    const groups = groupInstancesBySplitRules(
      [
        instance({
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          Modality: 'SEG',
          SOPInstanceUID: 'seg-1',
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
      defaultDisplaySetSplitRules
    );

    expect(groups.map((group) => group.matchedRule.id)).toEqual([
      'unsupported',
    ]);
    expect(createDisplaySetFromGroup(groups[0]).sopClassUids).toEqual([
      '1.2.840.10008.5.1.4.1.1.66.4',
      '1.2.840.10008.5.1.4.1.1.11.1',
    ]);
  });

  it('lets a fallback rule above the priority limit run before the catch-all', () => {
    const rules = createDisplaySetSplitRules({
      ...rawDisplaySetSelector,
      srFallback: { priority: 20000, matches: { Modality: 'SR' } },
    });
    const sr = instance({
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.11',
      Modality: 'SR',
      Rows: undefined,
    });

    expect(ruleIdsFor([sr], rules)).toEqual(['srFallback']);
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
        matches: { Modality: 'SEG' },
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

const compileOne = (rule: Record<string, unknown>, options = {}) =>
  createDisplaySetSplitRules(
    { r: { priority: 1, ...rule } } as unknown as RawDisplaySetSelector,
    options
  );

const errorOf = (rule: Record<string, unknown>, options = {}): string => {
  try {
    compileOne(rule, options);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the rule to fail to compile');
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
      displaySetContext: {
        hasNoThickness: 'BodyPartThickness == null',
        isAbsent: 'BodyPartThickness == undefined',
      },
    };
    expect(holds({ hasNoThickness: true }, options)).toEqual(NO_VALUE);
    expect(holds({ isAbsent: true }, options)).toEqual(['absent']);
  });

  it('gives false for an ordering comparison on no value, and never reads it as 0', () => {
    const options = { displaySetContext: { isThin: 'BodyPartThickness < 1' } };
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

  it('gives equals the meaning of a scalar test, with ==', () => {
    expect(holds('1', 1)).toBe(true);
    expect(holds('1', { equals: 1 })).toBe(true);
    expect(holds(['MR'], { equals: 'MR' })).toBe(true);
    expect(holds('CT', ['MR', 'CT'])).toBe(true);
  });

  it('reads includes with a scalar operand as "has the element"', () => {
    expect(holds(['ORIGINAL', 'LOCALIZER'], { includes: 'LOCALIZER' })).toBe(
      true
    );
    expect(holds('LOCALIZER', { includes: 'LOCALIZER' })).toBe(true);
    expect(holds(['ORIGINAL'], { includes: ['AXIAL', 'ORIGINAL'] })).toBe(true);
    expect(holds(['ORIGINAL'], { doesNotInclude: 'LOCALIZER' })).toBe(true);
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
    expect(errorOf({ matches: { Rows: { greaterThan: '1' } } })).toContain(
      "rule 'r'.matches.Rows: the operand of greaterThan must be a finite number"
    );
    expect(
      errorOf({ matches: { Rows: { greaterThan: 1, lessThan: 9 } } })
    ).toContain('more than one operator');
    expect(errorOf({ matches: { Rows: { greater: 1 } } })).toContain(
      "unknown operator 'greater'"
    );
  });

  it('rejects the removed forms: all, not, a comparison key and an expression', () => {
    expect(errorOf({ matches: { all: [{ Modality: 'CT' }] } })).toContain(
      "unknown name 'all'"
    );
    expect(errorOf({ matches: { not: { Modality: 'CT' } } })).toContain(
      "unknown name 'not'"
    );
    expect(errorOf({ matches: { 'NumberOfFrames >': 1 } })).toContain(
      "unknown name 'NumberOfFrames >'"
    );
    expect(errorOf({ matches: "Modality == 'CT'" })).toContain(
      'unrecognized condition'
    );
  });
});

describe('names - the compile checks every name', () => {
  it('rejects a misspelt keyword, with the rule, the place and the name', () => {
    expect(errorOf({ matches: { BodyPartExamind: 'CHEST' } })).toBe(
      "Invalid raw display set selector: rule 'r'.matches.BodyPartExamind: " +
        "unknown name 'BodyPartExamind': it is not a keyword of the DICOM " +
        'dictionary; a private, vendor or synthetic attribute needs a ' +
        'declaration, e.g. "myValue": { "attribute": "BodyPartExamind" }'
    );
  });

  it('matches names and operators with the same case, and names the correct one', () => {
    expect(errorOf({ matches: { modality: 'CT' } })).toContain(
      "unknown name 'modality'; did you mean 'Modality'?"
    );
    expect(errorOf({ matches: { Rows: { notnull: true } } })).toContain(
      "unknown operator 'notnull'; did you mean 'notNull'?"
    );
    // imageId is a declared context name, also with the keyword ImageID.
    expect(() => compileOne({ attributes: { id: 'imageId' } })).not.toThrow();
  });

  it('checks groupBy, sortBy, attributes, templates and context expressions', () => {
    expect(errorOf({ groupBy: ['SeriesInstanceUId'] })).toContain(
      "rule 'r'.groupBy[0]: unknown name 'SeriesInstanceUId'"
    );
    expect(errorOf({ sortBy: ['sweepStrat'] })).toContain(
      "rule 'r'.sortBy[0]: unknown name 'sweepStrat'"
    );
    expect(
      errorOf({ attributes: { label: { template: '{SeriesDescriptio}' } } })
    ).toContain(
      "rule 'r'.attributes.label.template: unknown name 'SeriesDescriptio'"
    );
    expect(
      errorOf({ context: { isChest: "BodyPartExamind == 'CHEST'" } })
    ).toContain("rule 'r'.context.isChest: unknown name 'BodyPartExamind'");
    expect(
      errorOf({}, { displaySetContext: { isLarge: 'pixelCont > 1' } })
    ).toContain("displaySetContext.isLarge: unknown name 'pixelCont'");
  });

  it('reads a hex tag only through a declaration', () => {
    expect(errorOf({ matches: { '00191010': 1 } })).toContain(
      'a hex tag needs a declaration'
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
    expect(errorOf({ context: { Modality: "'CT'" } })).toContain(
      "the context name 'Modality' is a DICOM keyword"
    );
    expect(errorOf({ context: { IsChest: 'true' } })).toContain(
      'must start with a lowercase letter'
    );
  });

  it('rejects === and !==, so that == is the only equality', () => {
    expect(errorOf({ context: { isCt: "Modality === 'CT'" } })).toContain(
      "'===' is not allowed; use '=='"
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
        displaySetContext: {
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
    expect(
      errorOf(
        {},
        { displaySetContext: { first: 'second + 1', second: 'first' } }
      )
    ).toContain('the context entries form a loop: first -> second -> first');
    expect(
      errorOf({}, { displaySetContext: { sweeps: 'timeClusters.cluster' } })
    ).toContain("the group 'timeClusters' has no field 'cluster'");
    expect(
      errorOf({ context: { timeClusters: 5 }, groupBy: ['sweepStart'] })
    ).toContain("'timeClusters' is not a group");
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
    expect(errorOf({ sortBy: [{ sortFunction: 'missing' }] })).toContain(
      'unknown sort function "missing"; known: (none)'
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
    expect(errorOf({ attributes: { label: 'SCOUT' } })).toBe(
      "Invalid raw display set selector: rule 'r'.attributes.label: unknown " +
        "name 'SCOUT': it is not a keyword of the DICOM dictionary; a private, " +
        'vendor or synthetic attribute needs a declaration, e.g. "myValue": ' +
        '{ "attribute": "SCOUT" }; fixed text is { "template": "SCOUT" }'
    );
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

  it('rejects a bare aggregate, displaySet.instances outside attributes, and displaySets', () => {
    expect(errorOf({ context: { most: 'max(Rows)' } })).toContain(
      'max(...) needs a receiver; use series.instances.max(...)'
    );
    expect(
      errorOf({ context: { most: 'displaySet.instances.max(Rows)' } })
    ).toContain(
      'rule \'r\'.context.most: displaySet.instances aggregates are available only in the { "expression" } form of attributes'
    );
    expect(
      errorOf({
        attributes: { all: { expression: 'displaySets.instances.count()' } },
      })
    ).toContain(
      'displaySets aggregates are not available yet; see https://github.com/cornerstonejs/cornerstone3D/issues/3000'
    );
  });

  it('reads splitNumber and sopClassUids in attributes only', () => {
    expect(errorOf({ matches: { splitNumber: 1 } })).toContain(
      "'splitNumber' is a value of the display set, and only attributes can read it"
    );
  });
});

describe('createDisplaySetSplitRules - validation', () => {
  it('rejects a selector that is not an object keyed by rule id', () => {
    expect(createDisplaySetSplitRules({})).toEqual({});
    expect(() => createDisplaySetSplitRules('rules' as never)).toThrow(
      /Invalid raw display set selector: selector must be an object keyed by rule id/
    );
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

  // JSON.parse makes `__proto__` a real own key. Stored in a plain object, the
  // key replaces the prototype, so the entry is lost with no error.
  it('rejects a __proto__ key instead of losing the entry', () => {
    expect(() =>
      createDisplaySetSplitRules(JSON.parse('{"__proto__": {"priority": 1}}'))
    ).toThrow(/"__proto__".*the id is not allowed/);
    expect(
      errorOf({ attributes: JSON.parse('{"__proto__": {"template": "x"}}') })
    ).toContain('the key "__proto__" is not allowed');
    expect(errorOf({ context: JSON.parse('{"__proto__": 1}') })).toContain(
      'the context name "__proto__" is not allowed'
    );
  });

  it('rejects an unknown rule field, with the rule id and the allowed fields', () => {
    expect(errorOf({ matchs: { Modality: 'CT' } })).toBe(
      "Invalid raw display set selector: rule 'r': unknown field 'matchs'; " +
        'allowed: id, groupId, priority, description, viewportTypes, context, ' +
        'matches, groupBy, sortBy, attributes'
    );
  });

  it('rejects a null matches instead of treating it as a catch-all', () => {
    expect(errorOf({ matches: null })).toContain('unrecognized condition');
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
        displaySetContext: {
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
    expect(errorOf({ matches: { toString: 1 } })).toContain(
      "unknown name 'toString'"
    );
    expect(errorOf({ matches: { constructor: 1 } })).toContain(
      "unknown name 'constructor'"
    );
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
        isStackImage: (
          i: NaturalizedInstance,
          values: Record<string, unknown>
        ) => values.isStackImage === true && i.Modality === 'CT',
      },
      matches: { isStackImage: true },
    };
    expect(claimed(rule, ct)).toEqual(['a']);
  });

  it('stops a loop through a code entry at the first read, and names each entry', () => {
    const options = {
      displaySetContext: {
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
    displaySetContext: {
      nameOf: (_i: NaturalizedInstance, values: Record<string, unknown>) =>
        values.PatientName,
    },
  };

  it('rejects a rule that names a denied name, and gives a code entry no value', () => {
    expect(errorOf({ matches: { PatientName: 'X' } }, options)).toContain(
      "the name 'PatientName' is on the deny list of the host"
    );
    expect(
      errorOf({ attributes: { label: { template: '{PatientName}' } } }, options)
    ).toContain('deny list');
    expect(
      claimed(
        { matches: { nameOf: null } },
        [instance({ SOPInstanceUID: 'p', PatientName: 'Doe^J' })],
        options
      )
    ).toEqual(['p']);
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
    expect(
      errorOf({ attributes: { label: { template: '{Modality.foo}' } } })
    ).toContain("'Modality' is a DICOM keyword and has no field 'foo'");
    expect(errorOf({ context: { s: "timeClusters['start']" } })).toContain(
      "read a field of the group 'timeClusters' by path"
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
