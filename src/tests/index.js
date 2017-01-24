/*global describe, it, beforeEach, before, after*/
'use strict'
const path = require('path')
const assert = require('assert')
const Promise = require('bluebird')
const ServiceManager = require('five-bells-service-manager')
const ServiceGraph = require('../lib/service-graph')

const notarySecretKey = 'lRmSmT/I2SS5I7+FnFgHbh8XZuu4NeL0wk8oN86L50U='
const notaryPublicKey = '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A='
const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const graph = new ServiceGraph(services)

describe('Basic', function () {
  before(function * () {
    yield graph.startLedger('test1.ledger1.', 3001, {
      recommendedConnectors: 'mark'
    })
    yield graph.startLedger('test1.ledger2.', 3002, {
      recommendedConnectors: 'mark,mary'
    })
    yield graph.startLedger('test1.ledger3.', 3003, {
      recommendedConnectors: 'mary'
    })

    yield graph.setupAccounts()

    yield graph.startConnector('mark', {
      edges: [
        {source: 'test1.ledger1.', target: 'test1.ledger2.'}
      ]
    })

    yield graph.startConnector('mary', {
      edges: [
        {source: 'test1.ledger2.', target: 'test1.ledger3.'}
      ]
    })

    yield services.startNotary(6001, {
      secretKey: notarySecretKey,
      publicKey: notaryPublicKey
    })

    yield graph.startReceivers({secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  after(function () { services.killAll() })

  describe('checking balances', function () {
    it('initializes with the correct amounts', function * () {
      yield services.assertBalance('test1.ledger1.', 'alice', '100')
      yield services.assertBalance('test1.ledger2.', 'bob', '100')
      // Connectors
      yield services.assertBalance('test1.ledger1.', 'hold', '0')
      yield services.assertBalance('test1.ledger2.', 'hold', '0')
      yield services.assertBalance('test1.ledger3.', 'hold', '0')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000')
      yield services.assertBalance('test1.ledger2.', 'mark', '1000')
      yield services.assertBalance('test1.ledger2.', 'mary', '1000')
      yield services.assertBalance('test1.ledger3.', 'mary', '1000')
    })
  })

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
      //  -   0.005  USD (mark: quoted connector slippage)
      //  ==============
      //     94.9849 USD
      yield services.assertBalance('test1.ledger1.', 'alice', '94.9849')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005.0151')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('test1.ledger2.', 'bob', '105')
      yield services.assertBalance('test1.ledger2.', 'mark', '995')
      yield graph.assertZeroHold()
    })

    it('transfers the funds (by source amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger2.bob',
        sourceAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test1.ledger1.', 'alice', '95')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  ==============
      //    104.9850  USD
      yield services.assertBalance('test1.ledger2.', 'bob', '104.985')
      yield services.assertBalance('test1.ledger2.', 'mark', '995.015')
      yield graph.assertZeroHold()
    })

    it('fails when there are insufficient source funds', function * () {
      let err
      try {
        yield services.sendPayment({
          sourceAccount: 'test1.ledger1.alice',
          sourcePassword: 'alice',
          destinationAccount: 'test1.ledger2.bob',
          destinationAmount: '500'
        })
      } catch (_err) {
        err = _err
      }
      assert.equal(err.name, 'NotAcceptedError')
      assert.equal(err.message, 'Sender has insufficient funds.')
      yield Promise.delay(2000)

      // No change to balances:
      yield services.assertBalance('test1.ledger1.', 'alice', '100')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000')
      yield services.assertBalance('test1.ledger2.', 'bob', '100')
      yield services.assertBalance('test1.ledger2.', 'mark', '1000')
      yield graph.assertZeroHold()
    })

    it('transfers a payment with 3 steps', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger3.bob',
        destinationAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (mary: connector spread/fee)
      //  -   0.0001 USD (mary: 1/10^scale)
      //  -   0.01   USD (mark: connector spread/fee)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  -   0.0001 USD (mark: round source amount up)
      //  ==============
      //     94.9748 USD
      yield services.assertBalance('test1.ledger1.', 'alice', '94.9748')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005.0252')

      yield services.assertBalance('test1.ledger2.', 'mark', '994.9849')
      yield services.assertBalance('test1.ledger2.', 'mary', '1005.0151')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('test1.ledger3.', 'bob', '105')
      yield services.assertBalance('test1.ledger3.', 'mary', '995')
      yield graph.assertZeroHold()
    })

    it('transfers a small amount (by destination amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger3.bob',
        destinationAmount: '0.01'
      })

      // Alice should have:
      //    100       USD
      //  -   0.01    USD (sent to Bob)
      //  -   0.00002 USD (mary: connector spread/fee)
      //  -   0.0001  USD (mary: 1/10^scale)
      //  -   0.00002 USD (mark: connector spread/fee)
      //  -   0.00001 USD (mark: quoted connector slippage)
      //  -   0.00005 USD (mark: round source amount up)
      //  ===============
      //     99.9898  USD
      yield services.assertBalance('test1.ledger1.', 'alice', '99.9898')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000.0102')

      yield services.assertBalance('test1.ledger2.', 'mark', '999.9899')
      yield services.assertBalance('test1.ledger2.', 'mary', '1000.0101')

      // Bob should have:
      //    100      USD
      //  +   0.01   USD (money from Alice)
      //  ==============
      //    100.01   USD
      yield services.assertBalance('test1.ledger3.', 'bob', '100.01')
      yield services.assertBalance('test1.ledger3.', 'mary', '999.99')
      yield graph.assertZeroHold()
    })

    it('transfers a small amount (by source amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger3.bob',
        sourceAmount: '0.01',
        destinationPrecision: '10',
        destinationScale: '4'
      })

      // Alice should have:
      //    100      USD
      //  -   0.01   USD (sent to Bob)
      //  ==============
      //     99.99   USD
      yield services.assertBalance('test1.ledger1.', 'alice', '99.99')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000.01')

      yield services.assertBalance('test1.ledger2.', 'mark', '999.9901')
      yield services.assertBalance('test1.ledger2.', 'mary', '1000.0099')

      // Bob should have:
      //    100       USD
      //  +   0.01    USD (money from Alice)
      //  -   0.00002 USD (mary: connector spread/fee)
      //  -   0.0001  USD (mary: 1/10^scale)
      //  -   0.00002 USD (mark: connector spread/fee)
      //  -   0.00001 USD (mark: quoted connector slippage)
      //  -   0.00005 USD (mark: round destination amount down)
      //  ===============
      //    100.0098  USD
      yield services.assertBalance('test1.ledger3.', 'bob', '100.0097')
      yield services.assertBalance('test1.ledger3.', 'mary', '999.9903')
      yield graph.assertZeroHold()
    })
  })

  describe('send atomic payment', function () {
    it('transfers the funds', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger2.bob',
        destinationAmount: '5',
        notary: 'http://localhost:6001',
        notaryPublicKey
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.0001 USD (connector rounding in its favor)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  ==============
      //     94.9849 USD
      yield services.assertBalance('test1.ledger1.', 'alice', '94.9849')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005.0151')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('test1.ledger2.', 'bob', '105')
      yield services.assertBalance('test1.ledger2.', 'mark', '995')
      yield graph.assertZeroHold()
    })
  })

  describe('send optimistic payment', function () {
    it('transfers the funds', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger2.bob',
        sourceAmount: '5',
        unsafeOptimisticTransport: true
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test1.ledger1.', 'alice', '95')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  ==============
      //    104.9850  USD
      yield services.assertBalance('test1.ledger2.', 'bob', '104.985')
      yield services.assertBalance('test1.ledger2.', 'mark', '995.015')
      yield graph.assertZeroHold()
    })

    it('transfers without hold, so payment can partially succeed', function * () {
      yield services.updateAccount('test1.ledger3.', 'mary', {balance: '0'})
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger3.bob',
        sourceAmount: '5',
        destinationPrecision: '10',
        destinationScale: '4',
        unsafeOptimisticTransport: true
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test1.ledger1.', 'alice', '95')
      yield services.assertBalance('test1.ledger1.', 'mark', '1005')

      yield services.assertBalance('test1.ledger2.', 'mark', '995.01')
      yield services.assertBalance('test1.ledger2.', 'mary', '1004.99')

      // No change, since mary doesn't have any money to send bob.
      yield services.assertBalance('test1.ledger3.', 'bob', '100')
      yield services.assertBalance('test1.ledger3.', 'mary', '0')
      yield graph.assertZeroHold()
    })
  })

  describe('send same-ledger payment', function () {
    it('transfers the funds (by destination amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger1.bob',
        destinationAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test1.ledger1.', 'alice', '95')
      yield services.assertBalance('test1.ledger1.', 'bob', '105')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000')
      yield graph.assertZeroHold()
    })

    it('transfers the funds (by source amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test1.ledger1.bob',
        sourceAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test1.ledger1.', 'alice', '95')
      yield services.assertBalance('test1.ledger1.', 'bob', '105')
      yield services.assertBalance('test1.ledger1.', 'mark', '1000')
      yield graph.assertZeroHold()
    })
  })
})
