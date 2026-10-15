import {
  buildEcgModuleFromInstance,
  parseEcgAnnotations,
  parsePatientInfo,
  parseStudyInfo,
  parseDicomNumeric,
  parseDicomText,
  parseDicomUnit,
  matchEcgMetric,
  ECG_CODE_MAP,
} from '../src/utilities/metadataProvider/ecgFromInstance';

describe('ECG WaveformAnnotationSequence Parsing', () => {
  describe('Positive Tests: Standard LOINC Codes', () => {
    it('parses all 9 standardized LOINC metric codes accurately', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'Ventricular Heart Rate', CodeValue: '8867-4' },
            ],
            NumericValue: 72,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'bpm' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'PR Interval', CodeValue: '8625-6' },
            ],
            NumericValue: 161,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'ms' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'QRS Duration', CodeValue: '8633-0' },
            ],
            NumericValue: 75,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'ms' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'QT Interval', CodeValue: '8634-8' },
            ],
            NumericValue: 368,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'ms' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'QTc Interval', CodeValue: '8636-3' },
            ],
            NumericValue: 402,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'ms' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'RR Interval', CodeValue: '8637-1' },
            ],
            NumericValue: 833,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'ms' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'P Axis', CodeValue: '8626-4' },
            ],
            NumericValue: 74,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'deg' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'QRS Axis', CodeValue: '8632-2' },
            ],
            NumericValue: 52,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'deg' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'T Axis', CodeValue: '8638-9' },
            ],
            NumericValue: 57,
            MeasurementUnitsCodeSequence: [{ CodeMeaning: 'deg' }],
          },
          {
            UnformattedTextValue: 'NORMAL SINUS RHYTHM',
          },
          {
            TextValue: 'NORMAL ECG',
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations).toBeDefined();
      expect(annotations.ventricularHeartRate).toBe(72);
      expect(annotations.prInterval).toBe(161);
      expect(annotations.qrsDuration).toBe(75);
      expect(annotations.qtInterval).toBe(368);
      expect(annotations.qtcInterval).toBe(402);
      expect(annotations.rrInterval).toBe(833);
      expect(annotations.pAxis).toBe(74);
      expect(annotations.qrsAxis).toBe(52);
      expect(annotations.tAxis).toBe(57);
      expect(annotations.interpretations).toEqual([
        'NORMAL SINUS RHYTHM',
        'NORMAL ECG',
      ]);
      expect(annotations.all).toHaveLength(11);
    });

    it('parses IEEE 11073 (MDC) code for Ventricular Heart Rate (2:1)', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'Ventricular Heart Rate', CodeValue: '2:1' },
            ],
            NumericValue: 80,
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.ventricularHeartRate).toBe(80);
    });
  });

  describe('Positive Tests: Manufacturer Fallback Matching', () => {
    it('matches metrics via CodeMeaning regex when CodeValue is omitted or non-standard', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'Ventricular Heart Rate' },
            ],
            NumericValue: 68,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'p-r interval' }],
            NumericValue: 155,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QRS Duration' }],
            NumericValue: 88,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QT Interval' }],
            NumericValue: 390,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QTc Interval' }],
            NumericValue: 415,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'RR Interval' }],
            NumericValue: 882,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'P Axis' }],
            NumericValue: 45,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QRS Axis' }],
            NumericValue: 30,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'T Axis' }],
            NumericValue: 40,
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.ventricularHeartRate).toBe(68);
      expect(annotations?.prInterval).toBe(155);
      expect(annotations?.qrsDuration).toBe(88);
      expect(annotations?.qtInterval).toBe(390);
      expect(annotations?.qtcInterval).toBe(415);
      expect(annotations?.rrInterval).toBe(882);
      expect(annotations?.pAxis).toBe(45);
      expect(annotations?.qrsAxis).toBe(30);
      expect(annotations?.tAxis).toBe(40);
    });
  });

  describe('Positive Tests: Data Format Tolerances', () => {
    it('handles NumericValue as array, number, string, and string array', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8625-6' }],
            NumericValue: [160], // Array of numbers
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8633-0' }],
            NumericValue: '82', // String number
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8634-8' }],
            NumericValue: ['380'], // String array
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.prInterval).toBe(160);
      expect(annotations?.qrsDuration).toBe(82);
      expect(annotations?.qtInterval).toBe(380);
    });

    it('extracts unit preferring CodeMeaning then CodeValue', () => {
      const itemWithMeaning = {
        MeasurementUnitsCodeSequence: [{ CodeMeaning: 'milliseconds' }],
      };
      const itemWithValueOnly = {
        MeasurementUnitsCodeSequence: [{ CodeValue: 'ms' }],
      };
      const itemWithoutUnit = {};

      expect(parseDicomUnit(itemWithMeaning)).toBe('milliseconds');
      expect(parseDicomUnit(itemWithValueOnly)).toBe('ms');
      expect(parseDicomUnit(itemWithoutUnit)).toBeUndefined();
    });

    it('deduplicates identical text interpretations and ignores whitespace', () => {
      const instance = {
        WaveformAnnotationSequence: [
          { UnformattedTextValue: 'SINUS RHYTHM' },
          { TextValue: 'SINUS RHYTHM' }, // Duplicate
          { TextValue: '   ' }, // Whitespace only
          { UnformattedTextValue: 'NORMAL ECG' },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.interpretations).toEqual([
        'SINUS RHYTHM',
        'NORMAL ECG',
      ]);
    });
  });

  describe('Positive Tests: Heart Rate & RR Interval Logic', () => {
    it('derives ventricular heart rate from RR interval when heart rate is omitted', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8637-1' }],
            NumericValue: 1000, // 1000 ms -> 60 bpm
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.rrInterval).toBe(1000);
      expect(annotations?.ventricularHeartRate).toBe(60);
    });

    it('normalizes seconds-based RR interval (< 5s) to milliseconds before deriving heart rate', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8637-1' }],
            NumericValue: 0.857, // 0.857 seconds -> ~70 bpm
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.rrInterval).toBe(0.857);
      expect(annotations?.ventricularHeartRate).toBe(70);
    });

    it('prefers explicit heart rate over derived RR interval', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8867-4' }],
            NumericValue: 76,
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8637-1' }],
            NumericValue: 1000, // 60 bpm if derived
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.ventricularHeartRate).toBe(76);
      expect(annotations?.rrInterval).toBe(1000);
    });

    it('captures coded diagnostic findings without numeric values into interpretations', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'ATRIAL FIBRILLATION' }],
          },
          {
            ConceptNameCodeSequence: [
              { CodeMeaning: 'INCOMPLETE RIGHT BUNDLE BRANCH BLOCK' },
            ],
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.interpretations).toEqual([
        'ATRIAL FIBRILLATION',
        'INCOMPLETE RIGHT BUNDLE BRANCH BLOCK',
      ]);
    });

    it('matches manufacturer variations such as "Heart Rate", "Ventricular Rate", "QRS Width", and "Axis P"', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'Heart Rate' }],
            NumericValue: 70,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QRS Width' }],
            NumericValue: 84,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'Axis P' }],
            NumericValue: 45,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'Axis QRS' }],
            NumericValue: 60,
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'Axis T' }],
            NumericValue: 30,
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.ventricularHeartRate).toBe(70);
      expect(annotations?.qrsDuration).toBe(84);
      expect(annotations?.pAxis).toBe(45);
      expect(annotations?.qrsAxis).toBe(60);
      expect(annotations?.tAxis).toBe(30);
    });
  });

  describe('Positive Tests: Patient and Study Metadata', () => {
    it('parses PatientInfo across string, object, and array formats', () => {
      const stringName = parsePatientInfo({
        PatientName: 'Doe^Jane',
        PatientID: 'P1',
        PatientSex: 'F',
        PatientAge: '045Y',
        PatientBirthDate: '19790101',
      });
      expect(stringName).toEqual({
        patientName: 'Doe^Jane',
        patientId: 'P1',
        patientSex: 'F',
        patientAge: '045Y',
        patientBirthDate: '19790101',
      });

      const objectName = parsePatientInfo({
        PatientName: { Alphabetic: 'Smith^John' },
      });
      expect(objectName.patientName).toBe('Smith^John');

      const arrayName = parsePatientInfo({
        PatientName: [{ Alphabetic: 'Brown^Charlie' }],
      });
      expect(arrayName.patientName).toBe('Brown^Charlie');
    });

    it('parses StudyInfo with modality defaulting to ECG', () => {
      const studyInfo = parseStudyInfo({
        StudyDate: '20230510',
        StudyTime: '143000',
        StudyDescription: 'Resting ECG 12-Lead',
        SeriesDescription: 'Standard ECG',
        Manufacturer: 'GE Healthcare',
        InstitutionName: 'General Hospital',
      });

      expect(studyInfo.studyDate).toBe('20230510');
      expect(studyInfo.studyTime).toBe('143000');
      expect(studyInfo.studyDescription).toBe('Resting ECG 12-Lead');
      expect(studyInfo.modality).toBe('ECG');
      expect(studyInfo.manufacturer).toBe('GE Healthcare');
      expect(studyInfo.institutionName).toBe('General Hospital');
    });
  });

  describe('Negative Tests & Edge Cases', () => {
    it('returns undefined when WaveformAnnotationSequence is absent or empty', () => {
      expect(parseEcgAnnotations({})).toBeUndefined();
      expect(
        parseEcgAnnotations({ WaveformAnnotationSequence: [] })
      ).toBeUndefined();
    });

    it('safely handles null, undefined, or empty items inside the sequence', () => {
      const instance = {
        WaveformAnnotationSequence: [
          null,
          undefined,
          {},
          {
            ConceptNameCodeSequence: [{ CodeValue: '8633-0' }],
            NumericValue: 80,
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations).toBeDefined();
      expect(annotations?.qrsDuration).toBe(80);
    });

    it('rejects invalid or non-numeric NumericValues without corrupting metrics', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8625-6' }],
            NumericValue: 'not-a-number',
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8633-0' }],
            NumericValue: NaN,
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8634-8' }],
            NumericValue: Infinity,
          },
          {
            ConceptNameCodeSequence: [{ CodeValue: '8636-3' }],
            NumericValue: '',
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.prInterval).toBeUndefined();
      expect(annotations?.qrsDuration).toBeUndefined();
      expect(annotations?.qtInterval).toBeUndefined();
      expect(annotations?.qtcInterval).toBeUndefined();
    });

    it('does not derive heart rate when RR interval is zero or negative', () => {
      const zeroRR = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8637-1' }],
            NumericValue: 0,
          },
        ],
      });
      expect(zeroRR?.ventricularHeartRate).toBeUndefined();

      const negativeRR = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeValue: '8637-1' }],
            NumericValue: -500,
          },
        ],
      });
      expect(negativeRR?.ventricularHeartRate).toBeUndefined();
    });

    it('handles unmapped/custom LOINC codes by placing them in all without corrupting standard properties', () => {
      const instance = {
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [
              {
                CodeMeaning: 'Custom Manufacturer Code',
                CodeValue: '99999-9',
                CodingSchemeDesignator: '99CUSTOM',
              },
            ],
            NumericValue: 123,
          },
        ],
      };

      const annotations = parseEcgAnnotations(instance);
      expect(annotations?.ventricularHeartRate).toBeUndefined();
      expect(annotations?.prInterval).toBeUndefined();
      expect(annotations?.all).toHaveLength(1);
      expect(annotations?.all?.[0].concept?.codeValue).toBe('99999-9');
      expect(annotations?.all?.[0].numericValue).toBe(123);
    });

    it('handles non-array array-like sequence objects safely', () => {
      const arrayLikeSequence = {
        0: {
          ConceptNameCodeSequence: [{ CodeValue: '8633-0' }],
          NumericValue: 90,
        },
        length: 1,
      };

      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: arrayLikeSequence,
      });
      expect(annotations?.qrsDuration).toBe(90);
    });
  });

  describe('Isolated Helper Unit Tests', () => {
    it('parseDicomNumeric handles valid and invalid inputs properly', () => {
      expect(parseDicomNumeric(120)).toBe(120);
      expect(parseDicomNumeric([120])).toBe(120);
      expect(parseDicomNumeric('120')).toBe(120);
      expect(parseDicomNumeric(['120'])).toBe(120);
      expect(parseDicomNumeric(0)).toBe(0);
      expect(parseDicomNumeric('0')).toBe(0);

      // Invalid / edge cases
      expect(parseDicomNumeric(null)).toBeUndefined();
      expect(parseDicomNumeric(undefined)).toBeUndefined();
      expect(parseDicomNumeric('')).toBeUndefined();
      expect(parseDicomNumeric('abc')).toBeUndefined();
      expect(parseDicomNumeric(NaN)).toBeUndefined();
      expect(parseDicomNumeric(Infinity)).toBeUndefined();
      expect(parseDicomNumeric(true)).toBeUndefined();
      expect(parseDicomNumeric(false)).toBeUndefined();
      expect(parseDicomNumeric([true])).toBeUndefined();
    });

    it('parseDicomText handles valid and invalid text inputs properly', () => {
      expect(parseDicomText('Normal ECG')).toBe('Normal ECG');
      expect(parseDicomText(['Normal ECG'])).toBe('Normal ECG');
      expect(parseDicomText('  Trimmable Text  ')).toBe('Trimmable Text');

      // Invalid / empty
      expect(parseDicomText(null)).toBeUndefined();
      expect(parseDicomText(undefined)).toBeUndefined();
      expect(parseDicomText('')).toBeUndefined();
      expect(parseDicomText('   ')).toBeUndefined();
      expect(parseDicomText(true)).toBeUndefined();
      expect(parseDicomText(false)).toBeUndefined();
    });

    it('matchEcgMetric resolves standard codes and falls back to regex', () => {
      expect(matchEcgMetric('8867-4', '')).toBe('ventricularHeartRate');
      expect(matchEcgMetric('2:1', '')).toBe('ventricularHeartRate');
      expect(matchEcgMetric('8625-6', '')).toBe('prInterval');
      expect(matchEcgMetric('8633-0', '')).toBe('qrsDuration');
      expect(matchEcgMetric('8634-8', '')).toBe('qtInterval');
      expect(matchEcgMetric('8636-3', '')).toBe('qtcInterval');
      expect(matchEcgMetric('8637-1', '')).toBe('rrInterval');
      expect(matchEcgMetric('8626-4', '')).toBe('pAxis');
      expect(matchEcgMetric('8632-2', '')).toBe('qrsAxis');
      expect(matchEcgMetric('8638-9', '')).toBe('tAxis');

      // Regex fallbacks
      expect(matchEcgMetric('', 'Ventricular Heart Rate')).toBe(
        'ventricularHeartRate'
      );
      expect(matchEcgMetric('', 'PR Interval')).toBe('prInterval');
      expect(matchEcgMetric('', 'QRS Duration')).toBe('qrsDuration');
      expect(matchEcgMetric('', 'QT Interval')).toBe('qtInterval');
      expect(matchEcgMetric('', 'QTc Interval')).toBe('qtcInterval');
      expect(matchEcgMetric('', 'RR Interval')).toBe('rrInterval');
      expect(matchEcgMetric('', 'P Axis')).toBe('pAxis');
      expect(matchEcgMetric('', 'QRS Axis')).toBe('qrsAxis');
      expect(matchEcgMetric('', 'T Axis')).toBe('tAxis');

      // Unmatched
      expect(matchEcgMetric('unknown', 'unknown')).toBeUndefined();
    });
  });
});
