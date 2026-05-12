#!/usr/bin/env node

const { run: runJscodeshift } = require('jscodeshift/src/Runner');
const { getTransform, listTransforms } = require('./index');

function printHelp() {
  console.log(`Usage:
  cornerstonejs-codemods list
  cornerstonejs-codemods --list
  cornerstonejs-codemods <transform> [paths...] [--dry] [--print]

Options:
  --list       List available transforms
  --dry        Preview changed files without writing
  --dry-run    Alias for --dry
  --print      Print changed file contents to stdout
  --parser     Parser passed to jscodeshift. Defaults to tsx
  --help       Show this help message`);
}

function readOption(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);

  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }

  return fallback;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--list') || args[0] === 'list') {
    listTransforms().forEach((name) => console.log(name));
    return;
  }

  const dryRun = args.includes('--dry-run') || args.includes('--dry');
  const print = args.includes('--print');
  const parser = readOption(args, '--parser', 'tsx');
  const positional = args.filter((arg, index) => {
    if (!arg.startsWith('-')) {
      const previous = args[index - 1];
      return previous !== '--parser';
    }

    return false;
  });
  const transformName = positional[0];
  const targets = positional.slice(1);

  if (!transformName) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const transformPath = getTransform(transformName);

  if (!transformPath) {
    console.error(`Unknown transform "${transformName}"`);
    console.error(`Available transforms: ${listTransforms().join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const result = await runJscodeshift(
    transformPath,
    targets.length ? targets : [process.cwd()],
    {
      dry: dryRun,
      extensions: 'js,jsx,ts,tsx',
      ignorePattern: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      parser,
      print,
      runInBand: true,
      verbose: 1,
    }
  );

  if (result.error > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
