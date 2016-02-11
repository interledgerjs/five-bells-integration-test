#!/usr/bin/env node

const co = require('co')
const DependencyManager = require('./lib/dependency-manager')

module.exports = {
  DependencyManager
}

if (!module.parent) {
  const dependencies = new DependencyManager()
  co(function * () {
    yield dependencies.install()
    console.log('Nothing bad happened. But I also didn\'t test anything.')
  }).catch((err) => console.error('exec error:', err))
}
