'use strict'

class ServiceGraph {
  /**
   * @param {ServiceManager} services
   */
  constructor (services) {
    this.services = services
    this.numLedgers = 0
    this.connectors = {} // { connectorName ⇒ {edges, port} }
  }

  startLedger (name, port, options) {
    this.numLedgers++
    return this.services.startLedger(name, port, options)
  }

  * startConnector (name, options) {
    this.connectors[name] = options
    options.pairs = this.edgesToPairs(options.edges)
    options.credentials = this.edgesToCredentials(options.edges, name)
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
      yield this.services.updateAccount(edge.source, connectorName, {balance: '1000'})
      yield this.services.updateAccount(edge.target, connectorName, {balance: '1000'})
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
