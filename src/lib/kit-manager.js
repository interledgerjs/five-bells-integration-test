'use strict'

const fs = require('fs')

// const Config = require('five-bells-shared').Config

function readConfig (pathToConfig) {
  const envFile = fs.readFileSync(pathToConfig)
  const fileLines = envFile.toString().split('\n')
  let config = {}
  for (const l of fileLines) {
    const pair = l.split('=')
    config[pair[0].toUpperCase()] = pair.slice(1).join('=')
  }
  return config
}

class KitManager {

  constructor (services) {
    this.services = services
    this.kits = []
  }

  numKits () {
    return Object.keys(this.kits).length
  }

   /**
   * Starts an ILP-kit. The kit starts a dedicated ledger and connector.
   * @param  {String}   hostname [Name to identify this kit instance]
   * @param  {Integer}  ledgerPort  [Port on which the kit's ledger is listening]
   * @param  {JSON}     options  [Environment variables for the ILP-kit]
   * @return {Promise}
   */
  // startKit (kitName, ledgerPort, ledgerPrefix, options) {
  startKit (pathToConfig) {
    const config = readConfig(pathToConfig)
    config.apiConfigFile = pathToConfig

    const kitName = config.CLIENT_TITLE || 'Kit' + this.numKits()
    this.kits.push(config)

    return this.services.startKit(kitName, config)
  }

  * setupAccounts () {
    for (const kitId in this.kits) {
      for (const user of ['alice', 'bob', 'connie']) {
        const config = this.kits[kitId]
        // create accounts on ledger
        yield this.services.updateAccount(config.LEDGER_ILP_PREFIX, user, {balance: 1000})
        // create corresponding ilp kit account
        yield this.services.updateKitAccount(config.LEDGER_ILP_PREFIX, user)
      }
    }
  }

  * assertBalance (kitConfig, name, expectedBalance) {
    yield this.services.assertBalance(kitConfig.LEDGER_ILP_PREFIX, name, expectedBalance)
  }
}

module.exports = KitManager
