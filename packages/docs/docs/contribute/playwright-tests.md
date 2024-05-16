---
id: playwright-tests
---

# Writing PlayWright Tests

Our Playwright tests are written using the Playwright test framework. We use these tests to test our examples and ensure that they are working as expected which in turn ensures that our packages are working as expected.

In this guide, we will show you how to write Playwright tests for our examples, create new examples and test against them.

## Testing against existing examples

If you would like to use an existing example, you can find the list of examples in the `utils/ExampleRunner/example-info.json` file. You can use the `exampleName` property to reference the example you would like to use. for example, if you would like to use the `annotationToolModes` example, you can use the following code snippet:

```ts
import { test } from '@playwright/test';
import { visitExample } from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'annotationToolModes');
});

test.describe('Annotation Tool Modes', async () => {
  test('should do something', async ({ page }) => {
    // Your test code here
  });
});
```

## Testing against new examples

Our playwright tests run against our examples, if you would like to add a new example, you can add it to the `examples` folder in the root of of the respective package, for example, `packages/tools/examples/{your_example_name}/index.ts`, and then add then register it in `utils/ExampleRunner/example-info.json` file under it's correct category, for example if its tool related, it can go into the existing `tools-basic` category. If you don't find a category that fits your example, you can create a new category and add it to the `categories` object in the `example-info.json` file.

```json
{
  "categories": {
    "tools-basic": {
      "description": "Tools library"
    },
    "examplesByCategory": {
      "tools-basic": {
        "your_example_name": {
          "name": "Good title for your example",
          "description": "Good description of what your example demonstrates"
        }
      }
    }
  }
}
```

Once this is done, you can write a test against the example by using the `visitExample` function in the `tests/utils/visitExample.ts` file. For example, if you would like to write a test against the `your_example_name` example, you can use the following code snippet:

```ts
import { test } from '@playwright/test';
import { visitExample } from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'your_example_name');
});

test.describe('Your Example Name', async () => {
  test('should do something', async ({ page }) => {
    // Your test code here
  });
});
```

This will also make your example appear in our docs page, so that users can see how to use the example, so you are adding double value by adding a new example.

## Screenshots

A good way to check your tests is working as expected is to capture screenshots at different stages of the test. You can use our checkForScreenshot function located in `tests/utils/checkForScreenshot.ts` to capture screenshots. You should also plan your screenshots in advance, screenshots need to be defined in the `tests/utils/screenshotPaths.ts` file. For example, if you would to capture a measurement after a measurement is added, you can define a screenshot path like this:

```ts
const screenShotPaths = {
  your_example_name: {
    measurementAdded: 'measurementAdded.png',
    measurementRemoved: 'measurementRemoved.png',
  },
};
```

It's okay if the screenshot doesn't exist yet, this will be dealt with in the next step. Once you have defined your screenshot path, you can use the `checkForScreenshot` function in your test to capture the screenshot. For example, if you would like to capture a screenshot after a measurement is added, you can use the following code snippet:

```ts
import { test } from '@playwright/test';
import {
  visitExample,
  checkForScreenshot,
  screenshotPath,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'your_example_name');
});

test.describe('Your Example Name', async () => {
  test('should do something', async ({ page }) => {
    // Your test code here to add a measurement
    const locator = page.locator('.cornerstone-canvas');
    await checkForScreenshot(
      locator,
      screenshotPath.your_example_name.measurementAdded
    );
  });
});
```

The test will automatically fail the first time you run it, it will however generate the screenshot for you, you will notice 3 new entries in the `tests/screenshots` folder, under `chromium/your-example.spec.js/measurementAdded.png`, `firefox/your-example.spec.js/measurementAdded.png` and `webkit/your-example.spec.js/measurementAdded.png` folders. You can now run the test again and it will use those screenshots to compare against the current state of the example.

## Running the tests

After you have wrote your tests, you can run them by using the following command:

```bash
yarn test:e2e:ci
```

If you want to use headed mode, you can use the following command:

```bash
yarn test:e2e:headed
```

You will see the test results in your terminal, if you want an indepth report, you can use the following command:

```bash
yarn playwright show-report
```
