import { test, expect } from 'playwright-test-coverage';
import { visitExample, simulateClicksOnElement } from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'rectangleROIStartEndThresholdWithSegmentation');
  page.on('console', async (msg) => {
    const msgType = msg.type();
    const msgText = msg.text();
    console.log(`BROWSER CONSOLE [${msgType}]: ${msgText}`);
    if (msgType === 'error' || msgType === 'warn') {
      // For more detailed error objects
      for (const arg of msg.args()) {
        const val = await arg.jsonValue();
        console.log(`  ARG: ${JSON.stringify(val, null, 2)}`);
      }
    }
  });
});

const testCases = [
  {
    name: 'Slice 1-5 Threshold 0.41% Statistics',
    startSlice: 0,
    endSlice: 5, // should be 4 once end slice also included
    threshold: 0.41,
    maxRelative: true,
    expectedStats: {
      // From MIM
      kurtosis: 6.38,
      max: 1.41,
      mean: 0.99,
      median: 1,
      min: 0.58,
      stdDev: 0.09,
      skewness: -1.97,
      //peakValue: 1.09, // edge case (start/end slice issue)
      lesionGlycolysis: 474.68,
      volume: 479.34,
    },
  },
  {
    name: 'Slice 10-15 0.41% Threshold Statistics',
    startSlice: 9,
    endSlice: 15, // should be 14 once end slice also included
    threshold: 0.41,
    maxRelative: true,
    expectedStats: {
      // From MIM
      kurtosis: 10.04,
      max: 1.09,
      mean: 0.97,
      median: 1,
      min: 0.45,
      stdDev: 0.1,
      skewness: -3.17,
      peakValue: 1.05,
      lesionGlycolysis: 572.68,
      volume: 589.97,
    },
  },
  {
    name: 'Slice 1-5 Threshold 0.8 Statistics',
    startSlice: 0,
    endSlice: 5, // should be 4 once end slice also included
    threshold: 0.8,
    maxRelative: false,
    expectedStats: {
      // From MIM
      kurtosis: 2.7,
      max: 1.41,
      mean: 1,
      median: 1.01,
      min: 0.8,
      stdDev: 0.06,
      skewness: -0.08,
      //peakValue: 1.09, // edge case (start/end slice issue)
      lesionGlycolysis: 459.44,
      volume: 457.4,
    },
  },
  {
    name: 'Slice 10-15 0.8 Threshold Statistics',
    startSlice: 9,
    endSlice: 15, // should be 14 once end slice also included
    threshold: 0.8,
    maxRelative: false,
    expectedStats: {
      // From MIM
      kurtosis: 7.48,
      max: 1.09,
      mean: 1,
      median: 1,
      min: 0.8,
      stdDev: 0.04,
      skewness: -2.27,
      peakValue: 1.05,
      lesionGlycolysis: 546.97,
      volume: 549.28,
    },
  },
];

testCases.forEach(
  ({ name, startSlice, endSlice, threshold, maxRelative, expectedStats }) => {
    test(name, async ({ page }) => {
      //const canvas = await page.locator('canvas');

      // Jump to slice - Move to utils?
      const jumpToSlice = async (sliceIndex) => {
        await page.evaluate((index) => {
          const cornerstone = window.cornerstone;
          cornerstone.utilities.jumpToSlice(
            cornerstone.getEnabledElementByViewportId('PT_AXIAL').viewport
              .element,
            { imageIndex: index }
          );
        }, sliceIndex);
      };
      await page.evaluate(() => {
        const cornerstone = window.cornerstone;
        const renderingEngine =
          cornerstone.getRenderingEngine('myRenderingEngine'); // Use your actual rendering engine ID
        if (renderingEngine) {
          const viewport = renderingEngine.getViewport('PT_AXIAL'); // Use one of your viewport IDs
          if (viewport) {
            viewport.render(); // Explicitly call render again
            return new Promise((resolve) => requestAnimationFrame(resolve));
          }
        }
        return Promise.resolve(); // Fallback
      });

      // Set threshold if provided
      if (threshold) {
        await page.locator('#thresholdSlider').fill(threshold.toString());
      }

      if (!maxRelative) {
        await page.locator('#thresholdMaxRelative').uncheck();
      }

      // Goto start slice
      await jumpToSlice(startSlice);
      await page.evaluate(() => {
        const cornerstone = window.cornerstone;
        const renderingEngine =
          cornerstone.getRenderingEngine('myRenderingEngine'); // Use your actual rendering engine ID
        if (renderingEngine) {
          const viewport = renderingEngine.getViewport('PT_AXIAL'); // Use one of your viewport IDs
          if (viewport) {
            viewport.render(); // Explicitly call render again
            return new Promise((resolve) => requestAnimationFrame(resolve));
          }
        }
        return Promise.resolve(); // Fallback
      });

      // Define region
      const locator = page.locator('canvas').first();
      await simulateClicksOnElement({
        locator,
        points: [
          { x: 10, y: 10 },
          { x: 400, y: 400 },
        ],
      });

      // Set start slice
      await page.getByRole('button', { name: 'Set Start Slice' }).click();

      // Goto end slice
      await jumpToSlice(endSlice);

      // Set end slice
      await page.getByRole('button', { name: 'Set End Slice' }).click();

      // Pause 100 ms to account for debounce
      await page.waitForTimeout(100);

      // Run threshold over ROI
      await page.getByRole('button', { name: 'Run Segmentation' }).click();

      // Get calculations
      const stats = await page.evaluate(() => {
        // Access csTools from window object
        const cornerstoneTools = window.cornerstoneTools;

        // calculate Statistics over threshold region
        const segmentationId = 'MY_SEGMENTATION_ID'; // from example page
        return cornerstoneTools.utilities.segmentation.getStatistics({
          segmentationId,
          segmentIndices: 1,
          mode: 'individual',
        });
      });

      // Check Calculations
      for (const stat in expectedStats) {
        if (stat === 'lesionGlycolysis' || stat === 'volume') {
          await expect
            .soft(stats['1'][stat].value / 1000000)
            .toBeCloseTo(expectedStats[stat], 1);
        } else {
          await expect
            .soft(stats['1'][stat].value)
            .toBeCloseTo(expectedStats[stat], 2);
        }
      }
    });
  }
);
