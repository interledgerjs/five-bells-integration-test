'use strict'

const notificationPrivateKeys = [
  require.resolve('../tests/data/notificationSigningPrivate1.pem'),
  require.resolve('../tests/data/notificationSigningPrivate2.pem'),
  require.resolve('../tests/data/notificationSigningPrivate3.pem')
]
const notificationPublicKeys = [
  require.resolve('../tests/data/notificationSigningPublic1.pem'),
  require.resolve('../tests/data/notificationSigningPublic2.pem'),
  require.resolve('../tests/data/notificationSigningPublic3.pem')
]
const notificationConditions = [
  'cc:3:11:VIXEKIp-38aZuievH3I3PyOobH6HW-VD4LP6w-4s3gA:518',
  'cc:3:11:Mjmrcm06fOo-3WOEZu9YDSNfqmn0lj4iOsTVEurtCdI:518',
  'cc:3:11:xnTtXKlRuFnFFDTgnSxFn9mYMeimdhbWaZXPAp5Pbs0:518'
]

class ServiceGraph {
  /**
   * @param {ServiceManager} services
   */
  constructor (services) {
    this.services = services
    this.numLedgers = 0
    this.connectors = {} // { connectorName ⇒ {edges, port} }
    this.notificationConditions = {}
  }

  startLedger (name, port, options) {
    const host = 'http://localhost:' + port
    this.notificationConditions[host] = notificationConditions[this.numLedgers % 3]
    options.notificationPrivateKey = notificationPrivateKeys[this.numLedgers % 3]
    options.notificationPublicKey = notificationPublicKeys[this.numLedgers % 3]
    this.numLedgers++
    return this.services.startLedger(name, port, options)
  }

  * startConnector (name, options) {
    this.connectors[name] = options
    options.pairs = this.edgesToPairs(options.edges)
    options.credentials = this.edgesToCredentials(options.edges, name)
    options.notificationKeys = this.notificationConditions
    yield this.setupConnectorAccounts(name)
    yield this.services.startConnector(name, options)
  }

  /**
   * @param {Object} options
   * @param {String} options.secret
   */
  * startReceivers (options) {
    const hmacKey = new Buffer(options.secret, 'base64')
    for (const ledgerPrefix in this.services.ledgers) {
      yield this.services.startReceiver({
        prefix: ledgerPrefix,
        account: this.services.ledgers[ledgerPrefix] + '/accounts/bob',
        password: 'bob',
        hmacKey: hmacKey
      })
    }
  }

  edgesToPairs (edges) {
    const pairs = []
    for (const edge of edges) {
      pairs.push(['USD@' + edge.source, 'USD@' + edge.target])
      pairs.push(['USD@' + edge.target, 'USD@' + edge.source])
    }
    return pairs
  }

  edgesToCredentials (edges, connectorName) {
    const credentials = {}
    for (const edge of edges) {
      credentials[edge.source] = this.makeCredentials(edge.source, connectorName)
      credentials[edge.target] = this.makeCredentials(edge.target, connectorName)
    }
    return credentials
  }

  * setupAccounts () {
    // Sender/receiver
    for (const ledgerPrefix in this.services.ledgers) {
      yield this.services.updateAccount(ledgerPrefix, 'alice', {balance: '100'})
      yield this.services.updateAccount(ledgerPrefix, 'bob', {balance: '100'})
    }
    // Connectors
    for (const connectorName in this.connectors) {
      yield this.setupConnectorAccounts(connectorName)
    }
  }

  * setupConnectorAccounts (connectorName) {
    const connector = this.connectors[connectorName]
    for (const edge of connector.edges) {
      yield this.services.updateAccount(edge.source, connectorName, {balance: '1000', connector: edge.source + connectorName})
      yield this.services.updateAccount(edge.target, connectorName, {balance: '1000', connector: edge.target + connectorName})
    }
  }

  * assertZeroHold () {
    for (const ledgerPrefix in this.services.ledgers) {
      yield this.services.assertBalance(ledgerPrefix, 'hold', '0')
    }
  }

  makeCredentials (ledgerPrefix, name) {
    const ledgerHost = this.services.ledgers[ledgerPrefix]
    return {
      currency: 'USD',
      plugin: 'ilp-plugin-bells',
      options: {
        account: ledgerHost + '/accounts/' + encodeURIComponent(name),
        username: name,
        password: name
      }
    }
  }
}

module.exports = ServiceGraph
