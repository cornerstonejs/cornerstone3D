import dcmjs from '@dcmjs-org/dcmjs';
import LabelData from '../src/adapters/Cornerstone3D/LabelData';

const { Length } = dcmjs.utilities.TID300;

// The user experience must have this: an SR with a labelled measurement saves.
// The dcmjs 1.0 TID300 writer gives a one-item ConceptCodeSequence as the item.
describe('LabelData', () => {
  it('moves the free text finding site of a labelled length into a comment', () => {
    const tid300 = new Length({
      point1: { x: 1, y: 1 },
      point2: { x: 5, y: 5 },
      distance: 5.6,
      ReferencedSOPSequence: {
        ReferencedSOPClassUID: '1.2',
        ReferencedSOPInstanceUID: '1.3',
      },
      findingSites: [
        {
          CodeValue: 'CORNERSTONEFREETEXT',
          CodingSchemeDesignator: 'CORNERSTONEJS',
          CodeMeaning: 'my label',
        },
      ],
    });
    const label = new LabelData(tid300, {
      data: { label: 'my label', handles: {} },
    });

    const entries = label.contentItem();

    const codes = entries.flatMap((entry) =>
      entry.ConceptCodeSequence ? [...entry.ConceptCodeSequence] : []
    );
    expect(codes.map((code) => code.CodeValue)).not.toContain(
      'CORNERSTONEFREETEXT'
    );
    expect(entries.map((entry) => entry.TextValue)).toContain('my label');
  });
});
