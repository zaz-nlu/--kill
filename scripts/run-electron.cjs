// Starts Electron with ELECTRON_RUN_AS_NODE cleared.
// VS Code (and its extensions) set that variable in their terminals; with it set,
// electron.exe behaves like plain node and the window never opens.
const { spawn } = require('child_process')
const electronPath = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', code => process.exit(code === null ? 0 : code))
