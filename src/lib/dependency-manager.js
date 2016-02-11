'use strict'

const fs = require('fs')
const path = require('path')
const exec = require('promised-exec')
const spawn = require('child_process').spawn

class DependencyManager {
  constructor () {
    this.workDir = process.cwd()
    this.testDir = path.resolve(this.workDir, 'integration-test')
  }

  /**
   * Return the name of the hosting module.
   *
   * five-bells-integration-test is intended to be run as a dependency of a
   * specific five-bells module to be tested. This method returns the name of
   * that module, so that we can import the local copy rather than testing the
   * most recent stable version.
   *
   * @return {String} module name
   */
  getHostModuleName () {
    const packageJSON = require(path.resolve(this.workDir, 'package.json'))
    return packageJSON.name
  }

  /**
   * Return the package.json string with the correct testing dependencies.
   *
   * This function will calculate the correct dependencies for the integration
   * test. It will use the latest stable version for most modules, but it will
   * use the local version for the module-under-test.
   *
   * @return {String} stringified package.json
   */
  generateDummyPackageJSON () {
    const packageDescriptor = {
      name: 'five-bells-integration-test-instance',
      private: true,
      dependencies: Object.assign({
        // Default dependencies
        'five-bells-ledger': '*',
        'five-bells-connector': '*',
        'five-bells-sender': '*'
      }, {
        // Use local host module
        [this.getHostModuleName()]: 'file:../'
      })
    }
    return JSON.stringify(packageDescriptor, null, 2)
  }

  /**
   * Prepare a test directory and install dependencies.
   *
   * This method will prepare a directory for the integration test by first
   * generating a package.json and then running the npm installation routine.
   */
  * install () {
    // Prepare test directory
    yield exec('rm -rf ' + this.testDir)
    fs.mkdirSync(this.testDir)
    process.chdir(this.testDir)

    // Create package.json
    const dummyPackageJSONPath = path.resolve(this.testDir, 'package.json')
    fs.writeFileSync(dummyPackageJSONPath, this.generateDummyPackageJSON())

    // Install dependencies
    console.log('Installing dependencies:')
    yield this.spawn('npm', ['install'])
  }

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
  spawn (cmd, args, opts) {
    return new Promise((resolve, reject) => {
      opts = Object.assign({ stdio: 'inherit' }, opts)
      const proc = spawn(cmd, args, opts)
      proc.on('error', reject)
      proc.on('exit', resolve)
    })
  }
}

module.exports = DependencyManager
