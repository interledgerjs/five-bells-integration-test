'use strict'

const fs = require('fs')
const request = require('superagent')

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
   * @param  {String}   pathToConfig [Configuration file (env.list) used to start the ilp kit]
   * @return {Promise}
   */
  startKit (pathToConfig) {
    const config = readConfig(pathToConfig)
    config.apiConfigFile = pathToConfig

    const kitName = config.CLIENT_TITLE || 'Kit' + this.numKits()
    this.kits.push(config)

    return this.services.startKit(kitName, config)
  }

  * setupAccounts () {
    for (const kitId in this.kits) {
      const config = this.kits[kitId]
      // Create test accounts and fund them
      for (const user of ['alice', 'bob', 'connie']) {
        // create accounts on ledger
        yield this.services.updateAccount(config.LEDGER_ILP_PREFIX, user, {balance: 1000})
        // create corresponding ilp kit account
        yield this.services.updateKitAccount(config.LEDGER_ILP_PREFIX, user)
        // reset trustline balance
        yield this.services.updateTrustlineBalance(config.LEDGER_ILP_PREFIX, 0)
      }
    }
  }

  /**
  * Sets up a mutual peering relation between two ilp kits.
  */
  * setupPeering (kitConfig1, kitConfig2, options) {
    const limit = options.limit || 200
    const currency = options.currency || 'USD'

    yield this._setupPeering(kitConfig1,
      kitConfig2.API_HOSTNAME, limit, currency)
    yield this._setupPeering(kitConfig2,
      kitConfig1.API_HOSTNAME, limit, currency)
  }

  * _setupPeering (kitConfig, hostname, limit, currency) {
    try {
      yield request
        .post(`https://${kitConfig.API_HOSTNAME}:${kitConfig.API_PUBLIC_PORT}/api/peers`)
        .auth('admin', 'admin')
        .set('Content-Type', 'application/json')
        .send({
          hostname: hostname,
          limit: limit,
          currencyCode: currency})
    } catch (err) {
      throw new Error(`Error while trying to add peer ${hostname} to 
        ${kitConfig.API_HOSTNAME}: ${err}`)
    }
  }

  * assertBalance (kitConfig, name, expectedBalance) {
    const ledgerPrefix = kitConfig.LEDGER_ILP_PREFIX
    yield this.services.assertBalance(ledgerPrefix, name, expectedBalance)
  }

  * createInvite (kitConfig, amount) {
    try {
      const resp = yield request
        .post(`https://${kitConfig.API_HOSTNAME}:${kitConfig.API_PUBLIC_PORT}/api/invites`)
        .auth('admin', 'admin')
        .set('Content-Type', 'application/json')
        .send({amount: amount})

      return resp.body.code
    } catch (err) {
      console.log(err)
      throw new Error('Error while requesting an invite code: ')
    }
  }

  * createUser (kitConfig, data) {
    return yield request
      .post(`http://${kitConfig.API_HOSTNAME}:${kitConfig.API_PORT}/users/${data.username}`)
      .auth('admin', 'admin')
      .send(data)
  }

  * quote (kitConfig, user, data) {
    return yield request
        .post(`https://${kitConfig.API_HOSTNAME}:${kitConfig.API_PUBLIC_PORT}/api/payments/quote`)
        .auth(user, user)
        .set('Content-Type', 'application/json')
        .send(data)
  }
}

module.exports = KitManager
