#! /usr/bin/env node

/* eslint-disable */
var { program } = require('commander');
var path = require('path');
var shell = require('shelljs');
const readline = require('readline');

var examples = {};
var allExamplesFullPath = {};
var filteredExampleCorrectCase = null;
var webpackConfigPath = path.join(
  __dirname,
  './webpack-AUTOGENERATED.config.js'
);
var distDir = path.join(__dirname, 'dist');
var buildConfig = require('./template-config.js');
const rootPath = path.resolve(path.join(__dirname, '../..'));

program
  .option('-c, --config [file.js]', 'Configuration file')
  .option('--no-browser', 'Do not open the browser')
  .option('--https', 'Enable https')
  .parse(process.argv);

const options = program.opts();
//var configFilePath = path.join(process.cwd(), options.config.replace(/\//g, path.sep));
//var configuration = require(configFilePath);

function getSplittedPath(filePath) {
  var a = filePath.split('/');
  var b = filePath.split('\\');
  return a.length > b.length ? a : b;
}

function validPath(str) {
  return str?.replace(/\\\\/g, '/');
}

function calculateSubstringSimilarity(a, b) {
  let shorter = a;
  let longer = b;

  if (a.length > b.length) {
    shorter = b;
    longer = a;
  }

  let index = longer.indexOf(shorter);
  if (index !== -1) {
    // Prioritize matches that start at the beginning of the word.
    return shorter.length + (index === 0 ? 0.5 : 0);
  }

  for (let i = shorter.length; i >= 1; i--) {
    for (let j = 0; j + i <= shorter.length; j++) {
      const subString = shorter.substr(j, i);
      if (longer.includes(subString)) {
        return i;
      }
    }
  }

  return 0; // No substring match
}

function calculateSimilarity(a, b) {
  const substringScore = calculateSubstringSimilarity(a, b);

  if (substringScore > 0) {
    return -substringScore;
  } else {
    const distance = levenshteinDistance(a, b);
    return Math.abs(distance);
  }
}

let closestExampleNames = []; // Stores multiple closest names

// from https://github.com/systemed/iD/blob/1e78ee5c87669aac407c69493f3f532c823346ef/js/id/util.js#L97-L115
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1
          )
        ); // deletion
      }
    }
  }
  return matrix[b.length][a.length];
}

const configuration = {
  examples: [
    { path: 'packages/core/examples', regexp: 'index.ts' },
    { path: 'packages/tools/examples', regexp: 'index.ts' },
    { path: 'packages/ai/examples', regexp: 'index.ts' },
    { path: 'packages/labelmap-interpolation/examples', regexp: 'index.ts' },
    {
      path: 'packages/polymorphic-segmentation/examples',
      regexp: 'index.ts',
    },
    {
      path: 'packages/dicomImageLoader/examples',
      regexp: 'index.ts',
    },
    {
      path: 'packages/nifti-volume-loader/examples',
      regexp: 'index.ts',
    },
    {
      path: 'packages/adapters/examples',
      regexp: 'index.ts',
    },
  ],
};

if (configuration.examples) {
  var filterExamples = [].concat(program.args).filter((i) => !!i);

  var buildExample = filterExamples.length === 1;
  var exampleCount = 0;

  configuration.examples.forEach(function (entry) {
    const regexp = entry.regexp
      ? new RegExp(entry.regexp)
      : /example\/index.ts$/;
    let fullPath = path.join(rootPath, entry.path ? entry.path : entry);

    // Single example use case
    examples[fullPath] = {};
    var currentExamples = examples[fullPath];
    shell.cd(fullPath);
    shell
      .find('.')
      .filter(function (file) {
        return file.match(regexp);
      })
      .forEach(function (file) {
        var fullPath = getSplittedPath(file);
        var exampleName = fullPath.pop();

        while (['index.ts', 'example'].indexOf(exampleName) !== -1) {
          // make sure the matching of the name is not case sensitive
          exampleName = fullPath.pop();
        }

        allExamplesFullPath[exampleName] = path.join(
          rootPath,
          entry.path ? entry.path : entry,
          file
        );

        if (
          !buildExample ||
          filterExamples
            .map((i) => i.toLowerCase())
            .indexOf(exampleName.toLowerCase()) !== -1
        ) {
          currentExamples[exampleName] = './' + file;
          exampleCount++;
          filteredExampleCorrectCase = exampleName;
        } else {
          // store the similarity of the example name to the filter name
          // so that we can suggest the user the correct name later
          // Adjusted this block to consider multiple suggestions and the new similarity metric
          var similarity = calculateSimilarity(
            exampleName.toLowerCase(),
            filterExamples[0].toLowerCase()
          );
          closestExampleNames.push({
            name: exampleName,
            similarity: similarity,
          });
        }
      });
  });

  closestExampleNames.sort((a, b) => a.similarity - b.similarity);

  let topClosestNames = closestExampleNames
    .filter((item) => item.similarity < -2) // this is arbitrary and can be adjusted, but basically says at least two characters should match sequentially
    .map((item) => item.name);

  if (exampleCount === 0 && topClosestNames.length) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(
      `\n=> Error: Did not find any examples matching ${filterExamples[0]}`
    );

    // Prompting the user to select a suggested example by number
    console.log('Did you mean any of these?');
    console.log('\n');
    for (let i = topClosestNames.length - 1; i >= 0; i--) {
      console.log(`\x1b[32m[${i + 1}] ${topClosestNames[i]}\x1b[0m`);
    }

    console.log('[Enter "exit" to quit]');

    rl.question(
      'Enter the number of the example you want to run: ',
      (input) => {
        const selectedIndex = parseInt(input) - 1;

        // If user entered "exit", close the readline interface and exit
        if (input.toLowerCase() === 'exit') {
          rl.close();
          process.exit(0); // Exit gracefully
        } else if (
          selectedIndex >= 0 &&
          selectedIndex < topClosestNames.length
        ) {
          // If user selected a valid example, run that example
          filterExamples[0] = topClosestNames[selectedIndex];
          filteredExampleCorrectCase = filterExamples;
          rl.close();
          run();
        } else {
          // Invalid input; prompt again
          console.log(
            'Invalid selection. Please select a valid number or enter "exit" to quit.'
          );
          rl.close();
          process.exit(1); // Exit with error after user input
        }
      }
    );
  } else {
    // say name of running example
    run();
  }
}
function run() {
  console.log(`\n=> Running examples ${filterExamples.join(', ')}\n`);

  // run the build for dicom image loader
  // const currentWD = process.cwd();

  // for some reason the esm build of the dicom image loader
  // requires the core to be built first and cannot link it
  // shell.exec('yarn run build:esm');
  // shell.exec(`yarn run build:esm`);

  if (buildExample) {
    const exampleName = filteredExampleCorrectCase;
    const exBasePath = allExamplesFullPath[exampleName];

    const conf = buildConfig(
      exampleName,
      distDir,
      validPath(rootPath),
      validPath(exBasePath)
    );

    // console.log('conf', conf);
    shell.ShellString(conf).to(webpackConfigPath);

    // shell.cd(exBasePath);
    // You can run this with --no-cache after the serve to prevent caching
    // which can help when doing certain types of development.
    shell.exec(
      `rspack serve --host 0.0.0.0 ${
        options.https ? '--https' : ''
      } --config ${webpackConfigPath}`
    );
  } else {
    console.log('=> To run an example:');
    console.log('  $ npm run example -- PUT_YOUR_EXAMPLE_NAME_HERE\n');
  }
}
