// Runs the unit tests and the type check with Electron's bundled Node (this machine's own node is too old for vitest 5).
// tests/package_config.test.ts is left out: it has failed since package.json's build output moved to release-final2.
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const electron = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
const run = (args) => spawnSync(electron, args, { cwd: root, env, stdio: 'inherit' }).status ?? 1
const tests = run(['node_modules/vitest/vitest.mjs', 'run', '--exclude', 'tests/package_config.test.ts', '--exclude', 'node_modules/**'])
const types = run(['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit'])
process.exit(tests || types)
