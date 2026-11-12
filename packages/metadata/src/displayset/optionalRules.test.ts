import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import update from 'immutability-helper';
import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import {
  createDisplaySetSplitRules,
  displaySetRuleOrder,
  displaySetRules,
} from './displaySetRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { materializeSplitRules } from './splitRuleSet';
import type { NaturalizedInstance } from './types';
import { usSweepsAndClips } from './__fixtures__/scenarioInstances';

const RULES_DIR = join(__dirname, '../../rules/optional');

/** Removes the line and block comments of a JSONC text, and keeps the strings. */
const stripJsonComments = (text: string) =>
  text.replace(
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_, string) => string ?? ''
  );

/** The immutability-helper specs of `rules/optional/*.jsonc`, keyed by file id. */
const optionalRules: Record<string, object> = Object.fromEntries(
  readdirSync(RULES_DIR)
    .filter((name) => name.endsWith('.jsonc'))
    .map((name) => [
      name.slice(0, -'.jsonc'.length),
      JSON.parse(
        stripJsonComments(readFileSync(join(RULES_DIR, name), 'utf8'))
      ),
    ])
);
const AXIAL = [1, 0, 0, 0, 1, 0];

let uidCount = 0;
function instance(fields: Partial<NaturalizedInstance>): NaturalizedInstance {
  uidCount += 1;
  return {
    SeriesInstanceUID: 'series',
    SOPInstanceUID: `sop.${uidCount}`,
    Rows: 256,
    Columns: 256,
    ...fields,
  };
}

const ct = (fields: Partial<NaturalizedInstance>) =>
  instance({
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
    Modality: 'CT',
    PixelSpacing: [1, 1],
    ImageOrientationPatient: AXIAL,
    ...fields,
  });

const mr = (fields: Partial<NaturalizedInstance>) =>
  instance({
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
    Modality: 'MR',
    SeriesDescription: 'AX',
    ...fields,
  });

const dx = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance({
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.1.1',
      Modality: 'DX',
      InstanceNumber: index + 1,
    })
  );

const sr = (date: string, time: string) =>
  instance({
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.88.33',
    Modality: 'SR',
    ContentDate: date,
    ContentTime: time,
  });

/** One display set as a test reads it. */
type View = [rule: string, uids: unknown[], value?: unknown];

const defaults = { displaySetRules, displaySetRuleOrder };

/** The defaults with the optional files applied, in the order given. */
function applyFiles(ids: string[]) {
  return ids.reduce(
    (rules, id) => update(rules, optionalRules[id] as never),
    defaults
  );
}

/** The display sets of one split with the defaults and the optional files. */
function splitWith(
  ids: string | string[],
  instances: NaturalizedInstance[],
  read: (displaySet: Record<string, unknown>) => unknown = () => undefined
): View[] {
  const applied = applyFiles([ids].flat());
  const ruleSet = createDisplaySetSplitRules(
    materializeSplitRules(applied.displaySetRules, applied.displaySetRuleOrder)
  );
  // Reverse the arrival order: the result must not depend on it.
  return groupInstancesBySplitRules([...instances].reverse(), ruleSet).map(
    (group) => {
      const displaySet = createDisplaySetFromGroup(group) as unknown as Record<
        string,
        unknown
      >;
      const view: View = [
        group.matchedRule.id,
        group.instances.map((i) => i.SOPInstanceUID),
      ];
      const value = read(displaySet);
      return value === undefined ? view : [view[0], view[1], value];
    }
  );
}

const uids = (instances: NaturalizedInstance[]) =>
  instances.map((i) => i.SOPInstanceUID);
const description = (displaySet: Record<string, unknown>) =>
  displaySet.SeriesDescription;

describe('rules/optional/*.jsonc', () => {
  it('each file puts each rule it adds in the order, adds no default id, and compiles over the defaults', () => {
    expect(Object.keys(optionalRules).length).toBeGreaterThan(0);
    for (const id of Object.keys(optionalRules)) {
      const spec = optionalRules[id] as {
        displaySetRules?: { $merge?: object };
        displaySetRuleOrder?: { $unshift?: string[] };
      };
      const added = Object.keys(spec.displaySetRules?.$merge ?? {});
      expect(spec.displaySetRuleOrder?.$unshift ?? []).toEqual(added);
      for (const ruleId of added) {
        expect(displaySetRuleOrder).not.toContain(ruleId);
        expect(Object.keys(displaySetRules)).not.toContain(ruleId);
      }
      const applied = applyFiles([id]);
      expect(() =>
        createDisplaySetSplitRules(
          materializeSplitRules(
            applied.displaySetRules,
            applied.displaySetRuleOrder
          )
        )
      ).not.toThrow();
    }
  });
});

describe('rules/optional/*.jsonc - one split for each file', () => {
  it('dwiByBValue: one display set for each b-value, and one for the images with none', () => {
    const dwi = (DiffusionBValue: number, z: number) =>
      mr({
        DiffusionBValue,
        ImageOrientationPatient: AXIAL,
        ImagePositionPatient: [0, 0, z],
      });
    const b0 = [dwi(0, 2), dwi(0, 1)];
    const b1000 = [dwi(1000, 1), dwi(1000, 2)];
    const adc = [mr({ InstanceNumber: 9 })];

    expect(
      splitWith('dwiByBValue', [...b0, ...b1000, ...adc], description)
    ).toEqual([
      ['dwiByBValue', uids([b0[1], b0[0]]), 'AX b=0'],
      ['dwiByBValue', uids(b1000), 'AX b=1000'],
      ['mixedDimensionalityBValue', uids(adc)],
    ]);
  });

  it('multiEchoByEchoTime: one display set for each echo time, in position order', () => {
    const echo = (EchoTime: number, z: number) =>
      mr({
        EchoTime,
        ImageOrientationPatient: AXIAL,
        ImagePositionPatient: [0, 0, z],
      });
    const te2 = [echo(2.39, 5), echo(2.39, 0)];
    const te4 = [echo(4.77, 0), echo(4.77, 5)];

    const scout = mr({ EchoTime: 1.5, ImageType: ['ORIGINAL', 'LOCALIZER'] });

    expect(
      splitWith('multiEchoByEchoTime', [...te2, ...te4, scout], description)
    ).toEqual([
      ['multiEchoByEchoTime', uids([te2[1], te2[0]]), 'AX TE=2.39'],
      ['multiEchoByEchoTime', uids(te4), 'AX TE=4.77'],
      ['localizer', uids([scout])],
    ]);
  });

  it('multiEchoByEchoTime: a scout at another echo time does not make a series multi-echo', () => {
    const te2 = [2, 1].map((z) =>
      mr({
        EchoTime: 2.39,
        ImageOrientationPatient: AXIAL,
        ImagePositionPatient: [0, 0, z],
      })
    );
    const scout = mr({ EchoTime: 1.5, ImageType: ['ORIGINAL', 'LOCALIZER'] });

    expect(
      splitWith('multiEchoByEchoTime', [...te2, scout]).map(([rule]) => rule)
    ).toEqual(['localizer', 'volume3d']);
  });

  it('singleImageSeriesStack: one stack for a small DX series, and one display set for each image above the limit', () => {
    const small = dx(3);
    expect(splitWith('singleImageSeriesStack', small)).toEqual([
      ['singleImageSeriesStack', uids(small)],
    ]);
    expect(
      splitWith('singleImageSeriesStack', dx(10)).map(([rule]) => rule)
    ).toEqual(Array(10).fill('singleImageModality'));
  });

  it('volumePositionOrder: the slices of a volume in position order, not InstanceNumber order', () => {
    const slices = [10, 0, 5].map((z, index) =>
      ct({ InstanceNumber: index + 1, ImagePositionPatient: [0, 0, z] })
    );

    expect(splitWith('volumePositionOrder', slices)).toEqual([
      ['volume3d', uids([slices[1], slices[2], slices[0]])],
    ]);
  });

  it('byAcquisition: one display set for each acquisition, in InstanceNumber order', () => {
    const at = (AcquisitionNumber: number, InstanceNumber: number) =>
      ct({ AcquisitionNumber, InstanceNumber });
    const first = [at(1, 1), at(1, 2)];
    const second = [at(2, 3), at(2, 4)];

    expect(
      splitWith(
        'byAcquisition',
        [...second, ...first],
        (d) => d.acquisitionNumber
      )
    ).toEqual([
      ['volume3d', uids(first), 1],
      ['volume3d', uids(second), 2],
    ]);
  });

  it('volumePositionOrder with byAcquisition, in either order: one volume for each acquisition, in position order', () => {
    const at = (AcquisitionNumber: number, z: number, InstanceNumber: number) =>
      ct({
        AcquisitionNumber,
        InstanceNumber,
        ImagePositionPatient: [0, 0, z],
      });
    const first = [at(1, 5, 1), at(1, 0, 2)];
    const second = [at(2, 5, 3), at(2, 0, 4)];
    const expected: View[] = [
      ['volume3d', uids([first[1], first[0]])],
      ['volume3d', uids([second[1], second[0]])],
    ];

    for (const files of [
      ['volumePositionOrder', 'byAcquisition'],
      ['byAcquisition', 'volumePositionOrder'],
    ]) {
      expect(splitWith(files, [...first, ...second])).toEqual(expected);
    }
  });

  it('usTimeClusters: one display set for each sweep', () => {
    const { instances, sweeps } = usSweepsAndClips();

    expect(
      splitWith('usTimeClusters', instances, description).slice(0, 2)
    ).toEqual([
      ['usTimeClusters', uids(sweeps[0]), 'US ABDOMEN +0 s'],
      ['usTimeClusters', uids(sweeps[1]), 'US ABDOMEN +90 s'],
    ]);
  });

  it('usTimeClusters: a gap of 25 s starts a new sweep (rule gap 20 s, default gap 30 s)', () => {
    const us = (time: string) =>
      instance({
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.6.1',
        Modality: 'US',
        SeriesDescription: 'US',
        AcquisitionDateTime: `20260101${time}.000000`,
      });
    const first = [us('100000'), us('100005')];
    const second = [us('100030')];

    expect(
      splitWith('usTimeClusters', [...first, ...second], description)
    ).toEqual([
      ['usTimeClusters', uids(first), 'US +0 s'],
      ['usTimeClusters', uids(second), 'US +30 s'],
    ]);
  });

  it('regularVolume: the regular slices become one volume, and the other image stays with the defaults', () => {
    const regular = [0, 2, 4, 6, 8].map((z) =>
      ct({ ImagePositionPatient: [0, 0, z] })
    );
    const extra = ct({ ImagePositionPatient: [0, 0, 5] });

    expect(
      splitWith(
        'regularVolume',
        [...regular, extra],
        (d) => d.isReconstructable
      )
    ).toEqual([
      ['regularVolume', uids(regular), true],
      ['volume3d', uids([extra]), false],
    ]);
  });

  it('derivedObjectVersions: one SR display set for each version, in date order, and only the newest is the latest', () => {
    const versions = [
      sr('20260102', '090000'),
      sr('20260101', '170000'),
      sr('20260102', '120000.5'),
    ];

    expect(
      splitWith('derivedObjectVersions', versions, (d) => [
        d.handler,
        d.isLatestVersion,
      ])
    ).toEqual([
      [
        'structuredReportVersions',
        uids([versions[1]]),
        ['structuredReport', false],
      ],
      [
        'structuredReportVersions',
        uids([versions[0]]),
        ['structuredReport', false],
      ],
      [
        'structuredReportVersions',
        uids([versions[2]]),
        ['structuredReport', true],
      ],
    ]);
  });
});
