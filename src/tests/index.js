/*global describe, it, beforeEach, before*/
'use strict'
const assert = require('assert')
const Promise = require('bluebird')
const ServiceManager = require('../lib/service-manager')
const ServiceGraph = require('../lib/service-graph')

const notarySecretKey = 'lRmSmT/I2SS5I7+FnFgHbh8XZuu4NeL0wk8oN86L50U='
const notaryPublicKey = '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A='
const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

const services = new ServiceManager(process.cwd())
const graph = new ServiceGraph(services)

describe('Basic', function () {
  before(function * () {
    yield graph.startLedger('ledger1', 3001, {})
    yield graph.startLedger('ledger2', 3002, {})
    yield graph.startLedger('ledger3', 3003, {})

    yield graph.setupAccounts()

    yield graph.startConnector('mark', 4001, {
      edges: [
        {source: 'http://localhost:3001', target: 'http://localhost:3002'}
      ]
    })

    yield graph.startConnector('mary', 4002, {
      edges: [
        {source: 'http://localhost:3002', target: 'http://localhost:3003'}
      ]
    })

    yield services.startNotary('notary1', 6001, {
      secretKey: notarySecretKey,
      publicKey: notaryPublicKey
    })

    yield graph.startReceiver(7001, {secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  describe('account creation', function () {
    it('won\'t allow in incorrect admin password', function * () {
      try {
        yield services.updateAccount('http://localhost:3001', 'someone', {adminPass: 'wrong'})
      } catch (err) {
        assert.equal(err.status, 403)
        return
      }
      assert(false)
    })
  })

  describe('checking balances', function () {
    it('initializes with the correct amounts', function * () {
      yield services.assertBalance('http://localhost:3001', 'alice', '100')
      yield services.assertBalance('http://localhost:3002', 'bob', '100')
      // Connectors
      yield services.assertBalance('http://localhost:3001', 'hold', '0')
      yield services.assertBalance('http://localhost:3002', 'hold', '0')
      yield services.assertBalance('http://localhost:3003', 'hold', '0')
      yield services.assertBalance('http://localhost:3001', 'mark', '1000')
      yield services.assertBalance('http://localhost:3002', 'mark', '1000')
      yield services.assertBalance('http://localhost:3002', 'mary', '1000')
      yield services.assertBalance('http://localhost:3003', 'mary', '1000')
    })

    it('won\'t allow an incorrect admin password', function * () {
      try {
        yield services.getBalance('http://localhost:3001', 'alice', {adminPass: 'wrong'})
      } catch (err) {
        assert.equal(err.status, 403)
        return
      }
      assert(false)
    })
  })

  describe('send universal payment', function () {
    it('transfers the funds (by destination amount)', function * () {
      const receiverId = 'universal-0001'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3002/accounts/bob',
        destinationAmount: '5',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.0001 USD (connector rounding in its favor)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  -   0.0001 USD (mark: 1/10^scale)
      //  ==============
      //     94.9848 USD
      yield services.assertBalance('http://localhost:3001', 'alice', '94.9848')
      yield services.assertBalance('http://localhost:3001', 'mark', '1005.0152')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('http://localhost:3002', 'bob', '105')
      yield services.assertBalance('http://localhost:3002', 'mark', '995')
      yield services.assertZeroHold()
    })

    it('transfers the funds (by source amount)', function * () {
      const receiverId = 'universal-0002'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3002/accounts/bob',
        sourceAmount: '5',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('http://localhost:3001', 'alice', '95')
      yield services.assertBalance('http://localhost:3001', 'mark', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  -   0.0001 USD (mark: 1/10^scale)
      //  ==============
      //    104.9849  USD
      yield services.assertBalance('http://localhost:3002', 'bob', '104.9849')
      yield services.assertBalance('http://localhost:3002', 'mark', '995.0151')
      yield services.assertZeroHold()
    })

    it('fails when there are insufficient source funds', function * () {
      const receiverId = 'universal-0003'
      let err
      try {
        yield services.sendPayment({
          sourceAccount: 'http://localhost:3001/accounts/alice',
          sourcePassword: 'alice',
          destinationAccount: 'http://localhost:3002/accounts/bob',
          destinationAmount: '500',
          receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
          destinationMemo: { receiverId }
        })
      } catch (_err) { err = _err }
      assert.equal(err.status, 422)
      assert.deepEqual(err.response.body, {
        id: 'InsufficientFundsError',
        message: 'Sender has insufficient funds.',
        owner: 'alice'
      })
      yield Promise.delay(2000)

      // No change to balances:
      yield services.assertBalance('http://localhost:3001', 'alice', '100')
      yield services.assertBalance('http://localhost:3001', 'mark', '1000')
      yield services.assertBalance('http://localhost:3002', 'bob', '100')
      yield services.assertBalance('http://localhost:3002', 'mark', '1000')
      yield services.assertZeroHold()
    })

    it('transfers a payment with 3 steps', function * () {
      const receiverId = 'universal-0004'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3003/accounts/bob',
        destinationAmount: '5',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (mary: connector spread/fee)
      //  -   0.0001 USD (mary: 1/10^scale)
      //  -   0.01   USD (mark: connector spread/fee)
      //  -   0.0001 USD (mark: 1/10^scale)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  -   0.0001 USD (mark: round source amount up)
      //  ==============
      //     94.9747 USD
      yield services.assertBalance('http://localhost:3001', 'alice', '94.9747')
      yield services.assertBalance('http://localhost:3001', 'mark', '1005.0253')

      yield services.assertBalance('http://localhost:3002', 'mark', '994.9848')
      yield services.assertBalance('http://localhost:3002', 'mary', '1005.0152')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('http://localhost:3003', 'bob', '105')
      yield services.assertBalance('http://localhost:3003', 'mary', '995')
      yield services.assertZeroHold()
    })

    it('transfers a small amount (by destination amount)', function * () {
      const receiverId = 'universal-0005'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3003/accounts/bob',
        destinationAmount: '0.01',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   0.01   USD (sent to Bob)
      //  -   0.00002 USD (mary: connector spread/fee)
      //  -   0.0001  USD (mary: 1/10^scale)
      //  -   0.00002 USD (mark: connector spread/fee)
      //  -   0.0001  USD (mark: 1/10^scale)
      //  -   0.00001 USD (mark: quoted connector slippage)
      //  -   0.00005 USD (mark: round source amount up)
      //  ===============
      //     99.9897  USD
      yield services.assertBalance('http://localhost:3001', 'alice', '99.9897')
      yield services.assertBalance('http://localhost:3001', 'mark', '1000.0103')

      yield services.assertBalance('http://localhost:3002', 'mark', '999.9898')
      yield services.assertBalance('http://localhost:3002', 'mary', '1000.0102')

      // Bob should have:
      //    100      USD
      //  +   0.01   USD (money from Alice)
      //  ==============
      //    100.01   USD
      yield services.assertBalance('http://localhost:3003', 'bob', '100.01')
      yield services.assertBalance('http://localhost:3003', 'mary', '999.99')
      yield services.assertZeroHold()
    })

    it('transfers a small amount (by source amount)', function * () {
      const receiverId = 'universal-0005'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3003/accounts/bob',
        sourceAmount: '0.01',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   0.01   USD (sent to Bob)
      //  ==============
      //     99.99   USD
      yield services.assertBalance('http://localhost:3001', 'alice', '99.99')
      yield services.assertBalance('http://localhost:3001', 'mark', '1000.01')

      yield services.assertBalance('http://localhost:3002', 'mark', '999.9901')
      yield services.assertBalance('http://localhost:3002', 'mary', '1000.0099')

      // Bob should have:
      //    100       USD
      //  +   0.01    USD (money from Alice)
      //  -   0.00002 USD (mary: connector spread/fee)
      //  -   0.0001  USD (mary: 1/10^scale)
      //  -   0.00002 USD (mark: connector spread/fee)
      //  -   0.0001  USD (mark: 1/10^scale)
      //  -   0.00001 USD (mark: quoted connector slippage)
      //  -   0.00005 USD (mark: round destination amount down)
      //  ==============
      //    100.0097  USD
      yield services.assertBalance('http://localhost:3003', 'Bob', '100.0097')
      yield services.assertBalance('http://localhost:3003', 'mary', '999.9903')
      yield services.assertZeroHold()
    })
  })

  describe('send atomic payment', function () {
    it('transfers the funds', function * () {
      const receiverId = 'atomic-0001'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3002/accounts/bob',
        destinationAmount: '5',
        notary: 'http://localhost:6001',
        notaryPublicKey,
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  -   0.01   USD (connector spread/fee)
      //  -   0.0001 USD (connector rounding in its favor)
      //  -   0.0001 USD (mark: 1/10^scale)
      //  -   0.005  USD (mark: quoted connector slippage)
      //  ==============
      //     94.9848 USD
      yield services.assertBalance('http://localhost:3001', 'alice', '94.9848')
      yield services.assertBalance('http://localhost:3001', 'mark', '1005.0152')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  ==============
      //    105      USD
      yield services.assertBalance('http://localhost:3002', 'bob', '105')
      yield services.assertBalance('http://localhost:3002', 'mark', '995')
      yield services.assertZeroHold()
    })
  })

  describe('send same-ledger payment', function () {
    it('transfers the funds', function * () {
      const receiverId = 'same-ledger-0001'
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3001/accounts/bob',
        destinationAmount: '5',
        receiptCondition: services.createReceiptCondition(receiverSecret, receiverId),
        destinationMemo: { receiverId }
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('http://localhost:3001', 'alice', '95')
      yield services.assertBalance('http://localhost:3001', 'bob', '105')
      yield services.assertBalance('http://localhost:3001', 'mark', '1000')
      yield services.assertZeroHold()
    })
  })
})
