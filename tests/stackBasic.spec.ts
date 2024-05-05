import { test, expect } from '@playwright/test';
import { visitExample } from './utils/index';

test.describe('Basic Stack', async () => {
  test('should display a single DICOM image in a Stack viewport.', async ({
    page,
  }) => {
    await visitExample(page, 'stackBasic');
  });
});
