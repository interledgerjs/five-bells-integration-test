'use strict'

const Promise = require('bluebird')
const fs = require('fs')
const path = require('path')
const exec = require('promised-exec')
const fetch = require('node-fetch')
const spawn = require('../util').spawn

const DEFAULT_DEPENDENCIES = {
  'five-bells-ledger': '*',
  'five-bells-connector': '*',
  'five-bells-sender': '*'
}

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
   * Determine the branch being tested.
   *
   * If a local copy or the master branch is being tested, this method returns
   * null.
   *
   * @return {String|null} Branch under test
   */
  getBranchNameUnderTest () {
    const branch = process.env.CIRCLE_BRANCH
    if (typeof branch !== 'string') return null
    else if (branch === 'master') return null
    else return branch
  }

  /**
   * Check if the branch under test exists for a given Five Bells dependency.
   *
   * @return {Promise<Boolean>} true if the branch exists, false otherwise
   */
  checkForBranchOnDependency (dependency) {
    const branch = this.getBranchNameUnderTest()
    if (!branch) return false
    const url = `https://github.com/interledger/${dependency}/tree/${branch}`
    return fetch(url).then((response) => response.status === 200)
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
  generateDummyPackageJSON (dependencyOverrides) {
    const moduleUnderTestDependency = {
      // Local module is in the parent directory
      [this.getHostModuleName()]: 'file:../'
    }

    const packageDescriptor = {
      name: 'five-bells-integration-test-instance',
      private: true,
      dependencies: Object.assign(
        DEFAULT_DEPENDENCIES,
        dependencyOverrides,
        moduleUnderTestDependency
      )
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

    // Calculate dependency overrides based on git branches with same name
    const dependenciesToOverride = (yield Promise.filter(
      Object.keys(DEFAULT_DEPENDENCIES),
      this.checkForBranchOnDependency.bind(this)
    ))
    const dependencyOverrides = {}
    const branch = this.getBranchNameUnderTest()
    for (let dependency of dependenciesToOverride) {
      dependencyOverrides[dependency] = `interledger/${dependency}#${branch}`
    }

    // Create package.json
    const dummyPackageJSONPath = path.resolve(this.testDir, 'package.json')
    const dummyPackageJSON = this.generateDummyPackageJSON(dependencyOverrides)
    fs.writeFileSync(dummyPackageJSONPath, dummyPackageJSON)

    // Install dependencies
    console.log('Installing dependencies:')
    yield spawn('npm', ['install'])
  }
}

module.exports = DependencyManager
