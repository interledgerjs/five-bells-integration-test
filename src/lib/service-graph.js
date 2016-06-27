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
    this.ledgers = [] // A list of ledger hosts
    this.connectors = {} // { connectorName ⇒ {edges} }
    this.notificationConditions = {}
  }

  startLedger (name, port, options) {
    const host = 'http://localhost:' + port
    this.notificationConditions[host] = notificationConditions[this.numLedgers % 3]
    options.notificationPrivateKey = notificationPrivateKeys[this.numLedgers % 3]
    options.notificationPublicKey = notificationPublicKeys[this.numLedgers % 3]
    this.numLedgers = this.ledgers.push(host)
    return this.services.startLedger(name, port, options)
  }

  * startConnector (name, port, options) {
    this.connectors[name] = options
    options.pairs = this.edgesToPairs(options.edges)
    options.credentials = this.edgesToCredentials(options.edges, name)
    options.notificationKeys = this.notificationConditions
    yield this.setupConnectorAccounts(name)
    yield this.services.startConnector(name, port, options)
  }

  * startReceiver (port, options) {
    // Receiver accounts have to exist before receiver is started
    yield this.setupAccounts()
    options.credentials = this.ledgers.map(function (ledger) {
      return {account: ledger + '/accounts/bob', password: 'bob'}
    })
    yield this.services.startReceiver(port, options)
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
      credentials[edge.source] = makeCredentials(edge.source, connectorName)
      credentials[edge.target] = makeCredentials(edge.target, connectorName)
    }
    return credentials
  }

  * setupAccounts () {
    // Sender/receiver
    for (const ledger of this.ledgers) {
      yield this.services.updateAccount(ledger, 'alice', {balance: '100'})
      yield this.services.updateAccount(ledger, 'bob', {balance: '100'})
    }
    // Connectors
    for (const connectorName in this.connectors) {
      yield this.setupConnectorAccounts(connectorName)
    }
  }

  * setupConnectorAccounts (connectorName) {
    const connector = this.connectors[connectorName]
    for (const edge of connector.edges) {
      yield this.services.updateAccount(edge.source, connectorName, {balance: '1000'})
      yield this.services.updateAccount(edge.target, connectorName, {balance: '1000'})
    }
  }
}

function makeCredentials (ledger, name) {
  return {
    account_uri: ledger + '/accounts/' + encodeURIComponent(name),
    username: name,
    password: name
  }
}

module.exports = ServiceGraph
