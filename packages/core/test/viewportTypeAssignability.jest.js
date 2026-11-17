import path from 'path';
import ts from 'typescript';

/**
 * Type-level regression test for https://github.com/cornerstonejs/cornerstone3D/issues/2753
 *
 * Jest strips types through babel, so this test drives the TypeScript compiler
 * directly, the same way a consumer app sees the library:
 *
 * 1. Declarations are emitted in memory from the sources with the repo's own
 *    compiler options (as the published `.d.ts` files are).
 * 2. A small consumer snippet is type checked against those declarations with
 *    `strictNullChecks` enabled, as many consumer apps do (the repo itself
 *    builds with it disabled). Only the snippet's own diagnostics are asserted.
 */
const repoRoot = path.resolve(__dirname, '../../..');
const packagesDir = path.join(repoRoot, 'packages') + path.sep;
const snippetFileName = path.join(__dirname, '__viewportTypeConsumer__.ts');

const snippetSource = `
import type Viewport from '../src/RenderingEngine/Viewport';
import type VolumeViewport from '../src/RenderingEngine/VolumeViewport';
import type VolumeViewport3D from '../src/RenderingEngine/VolumeViewport3D';
import type { IEnabledElement } from '../src/types';

declare const enabledElement: IEnabledElement;
declare const volumeViewport: VolumeViewport;
declare const volumeViewport3D: VolumeViewport3D;

export const fromEnabledElement: Viewport = enabledElement.viewport;
export const fromVolumeViewport: Viewport = volumeViewport;
export const fromVolumeViewport3D: Viewport = volumeViewport3D;
`;

function getRepoCompilerOptions() {
  const configPath = path.join(repoRoot, 'tsconfig.base.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    repoRoot,
    undefined,
    configPath
  );

  return {
    ...options,
    paths: { '@cornerstonejs/*': ['packages/*/src'] },
  };
}

function createHost(compilerOptions, overrides) {
  const host = ts.createCompilerHost(compilerOptions, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);

  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const content = overrides.read(path.resolve(fileName));
    return content === undefined
      ? getSourceFile(fileName, languageVersion, ...rest)
      : ts.createSourceFile(fileName, content, languageVersion, true);
  };
  host.fileExists = (fileName) => {
    const exists = overrides.exists(path.resolve(fileName));
    return exists === undefined ? fileExists(fileName) : exists;
  };

  return host;
}

function getSnippetDiagnostics() {
  const repoOptions = getRepoCompilerOptions();
  const readSnippet = (fileName) =>
    fileName === snippetFileName ? snippetSource : undefined;

  // 1. Emit declarations in memory with the repo's compiler options.
  const declarations = new Map();
  const emitOptions = {
    ...repoOptions,
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
  };
  ts.createProgram(
    [snippetFileName],
    emitOptions,
    createHost(emitOptions, {
      read: readSnippet,
      exists: (fileName) => (readSnippet(fileName) ? true : undefined),
    })
  ).emit(undefined, (fileName, text) => {
    declarations.set(path.resolve(fileName), text);
  });

  // 2. Check the consumer snippet against the declarations only.
  const consumerOptions = {
    ...repoOptions,
    strictNullChecks: true,
    noEmit: true,
  };
  const isShadowedSource = (fileName) =>
    fileName.startsWith(packagesDir) &&
    /\.tsx?$/.test(fileName) &&
    !fileName.endsWith('.d.ts') &&
    declarations.has(fileName.replace(/\.tsx?$/, '.d.ts'));

  const program = ts.createProgram(
    [snippetFileName],
    consumerOptions,
    createHost(consumerOptions, {
      read: (fileName) => readSnippet(fileName) ?? declarations.get(fileName),
      exists: (fileName) => {
        if (readSnippet(fileName) || declarations.has(fileName)) {
          return true;
        }
        return isShadowedSource(fileName) ? false : undefined;
      },
    })
  );
  const sourceFile = program.getSourceFile(snippetFileName);

  return [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ].map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  );
}

describe('Viewport type assignability under strictNullChecks', () => {
  it('lets consumers assign volume viewports to the base Viewport type', () => {
    expect(getSnippetDiagnostics()).toEqual([]);
  }, 120000);
});
