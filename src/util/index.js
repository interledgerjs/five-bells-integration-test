'use strict'
const childProcess = require('child_process')

/**
 * Utility function for spawning processes.
 *
 * Spawns a child process and returns a promise that rejects on errors and
 * resolves when the child process exists. All output is redirected to the
 * host processes' stdio by default.
 *
 * For documentation on the parameters, please see Node's docs:
 * https://nodejs.org/api/child_process.html
 *
 * @return {Promise<Number>} Promise of the exit code of the process.
 */
function spawn (cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const proc = childProcess.spawn(cmd, args, opts)
    proc.on('error', reject)
    proc.on('exit', resolve)
  })
}

module.exports = {
  spawn
}
