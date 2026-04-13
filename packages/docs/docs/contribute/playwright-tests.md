---
id: playwright-tests
title: Writing Playwright Tests
summary: Comprehensive guide for creating end-to-end tests using Playwright, including working with example pages, capturing screenshots for comparisons, and simulating user interactions
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

A good way to check your tests is working as expected is to capture screenshots at different stages of the test. You can use our `checkForScreenshot` function located in `tests/utils/checkForScreenshot.ts` to capture screenshots. You should also plan your screenshots in advance, screenshots need to be defined in the `tests/utils/screenshotPaths.ts` file. For example, if you would to capture a screenshot after a measurement is added, you can define a screenshot path like this:

```ts
const screenShotPaths = {
  your_example_name: {
    measurementAdded: 'measurementAdded.png',
    measurementRemoved: 'measurementRemoved.png',
  },
};
```

It's okay if the screenshot doesn't exist yet, this will be dealt with in the next step. Once you have defined your screenshot path, you can use the `checkForScreenshot` function in your test to capture the screenshot. For example, if you would like to capture a screenshot of the `cornerstone-canvas` element after a measurement is added, you can use the following code snippet:

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
      page,
      locator,
      screenshotPath.your_example_name.measurementAdded
    );
  });
});
```

The test will automatically fail the first time you run it, it will however generate the screenshot for you, you will notice 3 new entries in the `tests/screenshots` folder, under `chromium/your-example.spec.js/measurementAdded.png`, `firefox/your-example.spec.js/measurementAdded.png` and `webkit/your-example.spec.js/measurementAdded.png` folders. You can now run the test again and it will use those screenshots to compare against the current state of the example. Please verify that the ground truth screenshots are correct before committing them or testing against them.

## Simulating mouse drags

If you would like to simulate a mouse drag, you can use the `simulateDrag` function located in `tests/utils/simulateDrag.ts`. You can use this function to simulate a mouse drag on an element. For example, if you would like to simulate a mouse drag on the `cornerstone-canvas` element, you can use the following code snippet:

```ts
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackManipulationTools');
});

test.describe('Basic Stack Manipulation', async () => {
  test('should manipulate the window level using the window level tool', async ({
    page,
  }) => {
    await page.getByRole('combobox').selectOption('WindowLevel');
    const locator = page.locator('.cornerstone-canvas');
    await simulateDrag(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationTools.windowLevel
    );
  });
});
```

Our simulate drag utility can simulate a drag on any element, and avoid going out of bounds. It will calculuate the bounding box of the element and ensure that the drag stays within the bounds of the element. This should be good enough for most tools, and better than providing custom x, and y coordinates which can be error prone and make the code difficult to maintain.

## Running the tests

After you have wrote your tests, you can run them by using the following command:

```bash
./scripts/run-playright.sh
./scripts/run-playright.sh --compat
./scripts/run-playright.sh --cpu
./scripts/run-playright.sh --next
```

The wrapper runs `npx playwright test`, auto-selects the test files for the chosen mode, and writes timestamped logs and artifacts under `reports/`.

Examples:

```bash
reports/legacy-playwright/<timestamp>/
reports/compat-playwright/<timestamp>/
reports/compat-cpu-playwright/<timestamp>/
reports/next-viewport-playwright/<timestamp>/
```

Supported wrapper flags:

- `--compat`: open example pages with `?type=next`.
- `--cpu`: open example pages with `?cpu=1`.
- `--next`: run only `tests/nextViewport/**/*.spec.ts`.

`--next` on Playwright is different from `--next` on Karma. Playwright uses it to select the `tests/nextViewport` suite only. Karma uses it as a convenience mode that runs compatibility and CPU passes.

Any other arguments are passed directly to `playwright test`, so you can still use the normal Playwright CLI:

```bash
./scripts/run-playright.sh --project chromium --headed
./scripts/run-playright.sh -g "stack viewport"
./scripts/run-playright.sh --workers 1
./scripts/run-playright.sh --update-snapshots
```

Useful environment variables:

- `PLAYWRIGHT_REUSE_EXISTING_SERVER=true|false`: control reuse of the configured local example server.
- The wrapper sets `PLAYWRIGHT_FORCE_COMPAT`, `PLAYWRIGHT_FORCE_CPU_RENDERING`, `PLAYWRIGHT_HTML_OUTPUT_DIR`, and `PLAYWRIGHT_HTML_OPEN=never` internally.

Examples:

```bash
./scripts/run-playright.sh
./scripts/run-playright.sh --compat
./scripts/run-playright.sh --project chromium --headed
./scripts/run-playright.sh -g "stack viewport"
PLAYWRIGHT_REUSE_EXISTING_SERVER=true ./scripts/run-playright.sh --project chromium
./scripts/run-playright.sh --next
```

## Updating Screenshot Baselines

Playwright snapshot files are stored under `tests/screenshots/<project>/<spec>/<name>.png`, using the path template from `playwright.config.ts`.

Normal runs compare against those committed screenshots. To rewrite them, pass Playwright's native snapshot flag through the wrapper:

```bash
./scripts/run-playright.sh --update-snapshots
./scripts/run-playright.sh --next --update-snapshots
./scripts/run-playright.sh --project chromium --update-snapshots
```

## Serving the examples manually for development

By default, Playwright uses the configured `webServer` in `playwright.config.ts`, which runs `bun build-and-serve-static-examples` and serves the examples at `http://localhost:3333`.

If you want to serve the examples manually during development, you can run the same command yourself and then tell Playwright to reuse the existing server:

```bash
yarn run build-and-serve-static-examples
PLAYWRIGHT_REUSE_EXISTING_SERVER=true ./scripts/run-playright.sh
```

## Playwright VSCode Extension and Recording Tests

If you are using VSCode, you can use the Playwright extension to help you write your tests. The extension provides a test runner and many great features such as picking a locator using your mouse, recording a new test, and more. You can install the extension by searching for `Playwright` in the extensions tab in VSCode or by visiting the [Playwright extension page](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright).

<div style={{padding:"56.25% 0 0 0", position:"relative"}}>
    <iframe src="https://player.vimeo.com/video/949208495?badge=0&amp;autopause=0&amp;player_id=0&amp;app_id=58479"
    frameBorder="0" allow="cross-origin-isolated" allowFullScreen style= {{ position:"absolute",top:0,left:0,width:"100%",height:"100%"}} title="Playwright Extension"></iframe>
</div>
