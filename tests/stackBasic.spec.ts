import { test, expect } from '@playwright/test';
import {
  visitExample,
  waitForRequest,
  checkForScreenshot,
} from './utils/index';

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport.', async ({
    page,
  }) => {
    await visitExample(page, 'stackBasic');
    await waitForRequest(page);
    //
    // const screenshotMatches = await checkForScreenshot(page, screenshotPath);

    //   if (!screenshotMatches) {
    //    throw new Error('Screenshot does not match.');
    //   }
  });
});
