import { parseEcgAnnotations } from '../src/utilities/metadataProvider/ecgFromInstance';

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

  describe('Negative Tests & Edge Cases', () => {
    it('returns undefined when WaveformAnnotationSequence is absent or empty', () => {
      expect(parseEcgAnnotations({})).toBeUndefined();
      expect(
        parseEcgAnnotations({ WaveformAnnotationSequence: [] })
      ).toBeUndefined();
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
  });
  describe('Global results only', () => {
    const item = (meaning, value, extra = {}) => ({
      ConceptNameCodeSequence: [{ CodeMeaning: meaning }],
      NumericValue: value,
      ...extra,
    });

    it('does not take an atrial rate as the ventricular rate', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          item('Ventricular Heart Rate', 60),
          item('Atrial Heart Rate', 75),
        ],
      });
      expect(annotations.ventricularHeartRate).toBe(60);
    });

    it('keeps the global value when a later item is for one lead', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          item('QRS Duration', 90),
          item('QRS Duration', 110, { ReferencedWaveformChannels: [1, 2] }),
          item('QRS Duration', 95),
        ],
      });
      expect(annotations.qrsDuration).toBe(90);
    });

    it('reads a value for all channels (channel number 0)', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          item('Ventricular Heart Rate', 72, {
            ReferencedWaveformChannels: [1, 0],
          }),
        ],
      });
      expect(annotations.ventricularHeartRate).toBe(72);
    });

    it('does not list trace markers as interpretations', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'QRS onset' }],
            ReferencedSamplePositions: [120],
          },
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'T end' }],
            TemporalRangeType: 'POINT',
            ReferencedTimeOffsets: [0.4],
          },
        ],
      });
      expect(annotations.interpretations).toEqual([]);
    });

    it('gives the unit of each metric', () => {
      const ucum = (CodeValue) => [
        { CodeValue, CodingSchemeDesignator: 'UCUM' },
      ];
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          item('QT Interval', 0.4, { MeasurementUnitsCodeSequence: ucum('s') }),
          item('RR Interval', 800, {
            MeasurementUnitsCodeSequence: ucum('ms'),
          }),
        ],
      });
      expect(annotations.qtInterval).toBe(0.4);
      expect(annotations.units).toEqual({
        qtInterval: 's',
        rrInterval: 'ms',
        ventricularHeartRate: '/min',
      });
      expect(annotations.ventricularHeartRate).toBe(75);
    });

    it('lists the value of a coded statement, not its name', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [
          {
            ConceptNameCodeSequence: [{ CodeMeaning: 'Finding' }],
            ConceptCodeSequence: [{ CodeMeaning: 'Sinus rhythm' }],
          },
        ],
      });
      expect(annotations.interpretations).toEqual(['Sinus rhythm']);
    });

    it('ignores a blank numeric value', () => {
      const annotations = parseEcgAnnotations({
        WaveformAnnotationSequence: [item('QT Interval', ' ')],
      });
      expect(annotations.qtInterval).toBeUndefined();
    });
  });
});
