/*global describe, it, beforeEach, before, after*/
'use strict'
const path = require('path')
const Promise = require('bluebird')
const ServiceManager = require('five-bells-service-manager')
const ServiceGraph = require('../lib/service-graph')

const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const graph = new ServiceGraph(services)

describe('Connector starts before ledgers', function () {
  before(function * () {
    const connectorReady = services.startConnector('mark', {
      pairs: graph.edgesToPairs([
        {source: 'test1.ledger1.', target: 'test1.ledger2.'}
      ]),
      credentials: {
        'test1.ledger1.': {
          currency: 'USD',
          plugin: 'ilp-plugin-bells',
          options: {
            account: 'http://localhost:3001/accounts/mark',
            username: 'mark',
            password: 'mark'
          }
        },
        'test1.ledger2.': {
          currency: 'USD',
          plugin: 'ilp-plugin-bells',
          options: {
            account: 'http://localhost:3002/accounts/mark',
            username: 'mark',
            password: 'mark'
          }
        }
      }
    })
    graph.connectors['mark'] = {
      edges: [ {source: 'test1.ledger1.', target: 'test1.ledger2.'} ]
    }

    // Wait until the connect() retries have enough time between them that the
    // accounts can be created before the connector reconnects. Otherwise, connect()
    // will 404 and the connector will fail to start.
    yield new Promise((resolve, reject) => setTimeout(resolve, 4000))

    yield graph.startLedger('test1.ledger1.', 3001, {
      recommendedConnectors: 'mark'
    })
    yield services.updateAccount('test1.ledger1.', 'mark', {balance: '1000'})
    yield graph.startLedger('test1.ledger2.', 3002, {
      recommendedConnectors: 'mark'
    })
    yield services.updateAccount('test1.ledger2.', 'mark', {balance: '1000'})

    yield graph.setupAccounts()
    yield connectorReady

    yield graph.startReceivers({secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  after(function () { services.killAll() })

  describe('send universal payment', function () {
    it('transfers the funds (by destination amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger2.bob',
        destinationAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.0001 USD (connector rounding in its favor)
      //  ==============
      //     94.9899 USD
      yield services.assertBalance('test1.ledger1.', 'alice', '94.9899')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005.0101')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('test1.ledger2.', 'bob', '105')
      yield services.assertBalance('test1.ledger2.', 'mark', '995')
    })
  })
})
