/*global describe, it, beforeEach, before, after*/
'use strict'
const path = require('path')
const ServiceManager = require('five-bells-service-manager')
const ServiceGraph = require('../lib/service-graph')

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const graph = new ServiceGraph(services)
const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

describe('Static Routes', function () {
  before(function * () {
    yield graph.startLedger('test3.ledger1.', 3101, {
      scale: 9,
      recommendedConnectors: 'mark'
    })
    yield graph.startLedger('test3.ledger2.', 3102, {
      scale: 4,
      recommendedConnectors: 'mark,martin'
    })
    yield graph.startLedger('test3.ledger3.', 3103, {
      scale: 4,
      recommendedConnectors: 'martin,mary'
    })
    yield graph.startLedger('test3.ledger4.', 3104, {
      scale: 4,
      recommendedConnectors: 'mary'
    })

    yield graph.setupAccounts()

    yield graph.startConnector('mark', {
      edges: [{source: 'test3.ledger1.', target: 'test3.ledger2.'}],
      storeCurves: false,
      broadcastCurves: false
    })

    yield graph.startConnector('martin', {
      edges: [{source: 'test3.ledger2.', target: 'test3.ledger3.'}],
      storeCurves: false,
      broadcastCurves: false,
      routes: [{
        connectorLedger: 'test3.ledger3.',
        connectorAccount: 'test3.ledger3.mary',
        targetPrefix: 'test3.ledger4.'
      }]
    })

    yield graph.startConnector('mary', {
      edges: [{source: 'test3.ledger3.', target: 'test3.ledger4.'}],
      storeCurves: false,
      broadcastCurves: false,
      // Disable route broadcasts so that martin is forced to use its static route.
      routeBroadcastEnabled: false
    })

    yield graph.startReceivers({secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  after(function () { services.killAll() })

  describe('send universal payment', function () {
    it('uses local static routes', function * () {
      yield services.sendPayment({
        sourceAccount: 'test3.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test3.ledger4.bob',
        destinationAmount: '5'
      })

      yield services.assertBalance('test3.ledger2.', 'alice', '94.9798')
      yield services.assertBalance('test3.ledger2.', 'martin', '1005.0202')

      yield services.assertBalance('test3.ledger3.', 'martin', '994.9899')
      yield services.assertBalance('test3.ledger3.', 'mary', '1005.0101')

      yield services.assertBalance('test3.ledger4.', 'bob', '105')
      yield services.assertBalance('test3.ledger4.', 'mary', '995')
    })

    it('uses broadcasted static routes', function * () {
      yield services.sendPayment({
        sourceAccount: 'test3.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test3.ledger4.bob',
        sourceAmount: '4.9999'
      })

      yield services.assertBalance('test3.ledger1.', 'alice', '95.0001')
      yield services.assertBalance('test3.ledger1.', 'mark', '1004.9999')

      yield services.assertBalance('test3.ledger2.', 'mark', '995.0102')
      yield services.assertBalance('test3.ledger2.', 'martin', '1004.9898')

      yield services.assertBalance('test3.ledger3.', 'martin', '995.0202')
      yield services.assertBalance('test3.ledger3.', 'mary', '1004.9798')

      yield services.assertBalance('test3.ledger4.', 'bob', '104.9697')
      yield services.assertBalance('test3.ledger4.', 'mary', '995.0303')
    })
  })
})
