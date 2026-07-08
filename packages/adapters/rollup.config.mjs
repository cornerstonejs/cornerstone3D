import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', { encoding: 'utf8' }));

/** Declared dependencies + Babel runtime (babelHelpers: "runtime"); keep out of dist/esm/node_modules. */
const EXTERNAL_IDS = new Set([
  'dcmjs',
  'gl-matrix',
  'ndarray',
  '@cornerstonejs/tools',
  '@cornerstonejs/core',
  '@kitware/vtk.js',
  'buffer',
]);

function isExternal(id) {
  if (EXTERNAL_IDS.has(id)) return true;
  // @babel/runtime and @babel/runtime-corejs2 (transform-runtime + package.json)
  if (id.startsWith('@babel/runtime')) return true;
  // Rollup may pass absolute resolved paths
  if (/[\\/]node_modules[\\/]@babel[\\/]runtime/.test(id)) return true;
  return false;
}

export default [
  // ESM configuration
  {
    external: isExternal,
    // version.ts is not reachable from index.ts, but the package exposes a
    // "./version" subpath export. With preserveModules, rollup only emits modules
    // in the graph, so list it as an explicit input to emit dist/esm/version.js.
    input: [pkg.src || 'src/index.ts', 'src/version.ts'],
    output: [
      {
        dir: 'dist/esm',
        format: 'es',
        sourcemap: false,
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
    ],
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: true,
      }),
      typescript({
        rootDir: 'src',
        outDir: 'dist/esm',
        allowJs: true,
        checkJs: false,
        strict: false,
        declaration: true,
        emitDeclarationOnly: false,
        lib: ['ES2022', 'dom'],
        target: 'ES2022',
        module: 'esnext',
        moduleResolution: 'node',
        sourceMap: false,
        exclude: ['node_modules', 'dist', 'examples/', 'old-examples'],
      }),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'runtime',
        extensions: ['.js', '.ts'],
      }),
      json(),
    ],
  },
];
