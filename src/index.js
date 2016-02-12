#!/usr/bin/env node

const Promise = require('bluebird-co')
const DependencyManager = require('./lib/dependency-manager')

module.exports = {
  DependencyManager
}

if (!module.parent) {
  const dependencies = new DependencyManager()
  Promise.coroutine(function * () {
    yield dependencies.install()

    // TODO: Test the packages together
    console.log('Nothing bad happened. But I also didn\'t test anything.')
  })().done()
}
