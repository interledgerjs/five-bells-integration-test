/*global describe, it, beforeEach, before, after*/
'use strict'
const path = require('path')
const assert = require('assert')
const ServiceManager = require('five-bells-service-manager')
const ServiceGraph = require('../lib/service-graph')

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const graph = new ServiceGraph(services)

const notarySecretKey = 'lRmSmT/I2SS5I7+FnFgHbh8XZuu4NeL0wk8oN86L50U='
const notaryPublicKey = '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A='
const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

describe('Advanced', function () {
  before(function * () {
    yield graph.startLedger('test2.ledger1.', 3101, {
      scale: 4,
      recommendedConnectors: 'mark2,martin2,millie2,michael2'
    })
    yield graph.startLedger('test2.ledger2.', 3102, {
      scale: 2,
      recommendedConnectors: 'mark2,mesrop2'
    })
    yield graph.startLedger('test2.ledger4.', 3104, {
      scale: 4,
      recommendedConnectors: 'martin2'
    })

    yield graph.startLedger('test2.ledger5.', 3105, {
      scale: 4,
      recommendedConnectors: 'millie2,mia2'
    })
    yield graph.startLedger('test2.ledger6.', 3106, {
      scale: 4,
      recommendedConnectors: 'mia2,mike2'
    })
    yield graph.startLedger('test2.ledger7.', 3107, {
      scale: 4,
      recommendedConnectors: 'mike2'
    })

    yield graph.startLedger('test2.ledger8.', 3108, {
      scale: 2,
      recommendedConnectors: 'mesrop2'
    })
    yield graph.startLedger('test2.ledger9.', 3109, {
      scale: 4,
      recommendedConnectors: 'michael2,micah2'
    })
    yield graph.startLedger('test2.ledger10.', 3110, {
      scale: 4,
      recommendedConnectors: 'micah2'
    })

    yield graph.startLedger('test2.group1.ledger1.', 3111, {
      scale: 4,
      recommendedConnectors: 'michelle2'
    })
    yield graph.startLedger('test2.group1.ledger2.', 3112, {
      scale: 4,
      recommendedConnectors: 'michelle2,milo2'
    })
    yield graph.startLedger('test2.group2.ledger1.', 3113, {
      scale: 4,
      recommendedConnectors: 'milo2,miles2'
    })
    yield graph.startLedger('test2.group2.ledger2.', 3114, {
      scale: 4,
      recommendedConnectors: 'miles2'
    })

    yield graph.setupAccounts()

    yield graph.startConnector('mark2', {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger2.'}]
    })

    yield graph.startConnector('martin2', {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger4.'}],
      fxSpread: '0.5'
    })

    yield graph.startConnector('millie2', {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger5.'}]
    })
    yield graph.startConnector('mia2', {
      edges: [{source: 'test2.ledger5.', target: 'test2.ledger6.'}]
    })
    yield graph.startConnector('mike2', {
      edges: [{source: 'test2.ledger6.', target: 'test2.ledger7.'}]
    })

    yield graph.startConnector('mesrop2', {
      edges: [{source: 'test2.ledger2.', target: 'test2.ledger8.'}],
      fxSpread: (1 - 0.877980).toFixed(8)
    })

    yield graph.startConnector('michelle2', {
      edges: [{source: 'test2.group1.ledger1.', target: 'test2.group1.ledger2.'}]
    })
    yield graph.startConnector('milo2', {
      edges: [{source: 'test2.group1.ledger2.', target: 'test2.group2.ledger1.'}],
      routeBroadcastEnabled: false
    })
    yield graph.startConnector('miles2', {
      edges: [{source: 'test2.group2.ledger1.', target: 'test2.group2.ledger2.'}]
    })

    yield graph.startConnector('michael2', {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger9.'}],
      fxSpread: '0'
    })
    yield graph.startConnector('micah2', {
      edges: [{source: 'test2.ledger9.', target: 'test2.ledger10.'}],
      fxSpread: '0'
    })

    yield services.startNotary(6101, {
      secretKey: notarySecretKey,
      publicKey: notaryPublicKey
    })

    yield graph.startReceivers({secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  after(function () { services.killAll() })

  describe('send universal payment', function () {
    it('scale: high → low; by source amount', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '4.9999'
      })

      // Alice should have:
      //    100      USD
      //  -   4.9999 USD (sent to Bob)
      //  ==============
      //     95.0001 USD
      yield services.assertBalance('test2.ledger1.', 'alice', '95.0001')
      yield services.assertBalance('test2.ledger1.', 'mark2', '1004.9999')

      // Bob should have:
      //    100       USD
      //  +   4.9999  USD (money from Alice)
      //  -   0.0099‥ USD (mark: spread/fee)
      //  ===============
      //    104.9851  USD
      //    104.98    USD (round down)
      yield services.assertBalance('test2.ledger2.', 'bob', '104.98')
      yield services.assertBalance('test2.ledger2.', 'mark2', '995.02')
    })

    it('scale: low → high', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger1.bob',
        sourceAmount: '4.99'
      })

      // Alice should have:
      //    100      USD
      //  -   4.99   USD (sent to Bob)
      //  ==============
      //     95.01   USD
      yield services.assertBalance('test2.ledger2.', 'alice', '95.01')
      yield services.assertBalance('test2.ledger2.', 'mark2', '1004.99')

      // Bob should have:
      //    100       USD
      //  +   4.99    USD (money from Alice)
      //  -   0.00998 USD (mark: spread/fee)
      //  ===============
      //    104.98002 USD
      //    104.9800  USD (round destination amount down)
      yield services.assertBalance('test2.ledger1.', 'bob', '104.98')
      yield services.assertBalance('test2.ledger1.', 'mark2', '995.02')
    })

    it('zero spread', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger10.bob',
        destinationAmount: '10'
      })

      // Alice should have:
      //    100      USD
      //  -  10      USD (sent to Bob)
      //  ==============
      //     90      USD
      yield services.assertBalance('test2.ledger1.', 'alice', '90')
      yield services.assertBalance('test2.ledger1.', 'michael2', '1010')

      yield services.assertBalance('test2.ledger9.', 'michael2', '990')
      yield services.assertBalance('test2.ledger9.', 'micah2', '1010')

      // Bob should have:
      //    100      USD
      //  +  10      USD (money from Alice)
      //  -   0      USD (michael: spread/fee)
      //  ==============
      //    110.0000 USD
      yield services.assertBalance('test2.ledger10.', 'bob', '110')
      yield services.assertBalance('test2.ledger10.', 'micah2', '990')
    })

    it('high spread', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger4.bob',
        sourceAmount: '5'
      })

      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('test2.ledger1.', 'alice', '95')
      yield services.assertBalance('test2.ledger1.', 'martin2', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   2.5    USD (martin: spread/fee)
      //  ==============
      //    102.5    USD
      yield services.assertBalance('test2.ledger4.', 'bob', '102.5')
      yield services.assertBalance('test2.ledger4.', 'martin2', '997.5')
    })

    it('many hops', function * () {
      // Send payment 1→5→6→7
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger7.bob',
        sourceAmount: '4.9999'
      })

      // Alice should have:
      //    100      USD
      //  -   4.9999 USD (sent to Bob)
      //  ==============
      //     95.0001 USD
      yield services.assertBalance('test2.ledger1.', 'alice', '95.0001')
      yield services.assertBalance('test2.ledger1.', 'millie2', '1004.9999')

      // Mia should have:
      //   1000         USD
      //  +   4.9999    USD (sent from Millie)
      //  -   0.0099998 USD (millie: spread/fee 1→5; 4.9999*0.002)
      //  =================
      //   1004.9899002 USD
      //   1004.9899    USD (round destination amount down)
      yield services.assertBalance('test2.ledger5.', 'millie2', '995.0101')
      yield services.assertBalance('test2.ledger5.', 'mia2', '1004.9899')

      // Mark should have:
      //   1000           USD
      //  +   4.9899      USD (sent from Mia)
      //  -   0.009979799 USD (mia: spread/fee 5→6; 4.9899*0.002)
      //  ===================
      //   1004.9799202   USD
      //   1004.9799      USD (round destination amount down)
      yield services.assertBalance('test2.ledger6.', 'mia2', '995.0201')
      yield services.assertBalance('test2.ledger6.', 'mike2', '1004.9799')

      // Bob should have:
      //    100         USD
      //  +   4.9999    USD (original amount from Alice)
      //  ×   0.998         (millie: spread/fee 1→5; 0.998 = 1 - 0.002)
      //  ×   0.998         (mia: spread/fee 5→6)
      //  ×   0.998         (mike: spread/fee 6→7)
      //  =================
      //    104.9699605 USD
      //    104.9699    USD (round destination down)
      yield services.assertBalance('test2.ledger7.', 'bob', '104.9699')
      yield services.assertBalance('test2.ledger7.', 'mike2', '995.0301')
    })

    it('rate check (by source amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger8.bob',
        sourceAmount: '10'
      })

      // Alice should have:
      //    100        USD
      //  -  10        USD (sent to Bob)
      //  ================
      //     90        USD
      yield services.assertBalance('test2.ledger2.', 'alice', '90')
      yield services.assertBalance('test2.ledger2.', 'mesrop2', '1010')

      // Bob should have:
      //    100        USD
      //  +  10        USD (money from Alice)
      //  *   0.877980     (mesrop: spread/fee; 10 * 0.877980 = 8.7798)
      //  ================
      //    108.7798   USD
      //    108.77     USD (round destination amount down)
      yield services.assertBalance('test2.ledger8.', 'bob', '108.77')
      yield services.assertBalance('test2.ledger8.', 'mesrop2', '991.23')
    })

    it('rate check (by destination amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger8.bob',
        destinationAmount: '10'
      })

      // Alice should have:
      //    100        USD
      //  -  10        USD (sent to Bob)
      //  ÷   0.877980     (mesrop: spread/fee; 10 / 0.877980 = 11.389781088407481)
      //  ================
      //     88.610218 USD
      //     88.61     USD (round source amount up (round source balance down))
      yield services.assertBalance('test2.ledger2.', 'alice', '88.61')
      yield services.assertBalance('test2.ledger2.', 'mesrop2', '1011.39')

      // Bob should have:
      //    100        USD
      //  +  10        USD (money from Alice)
      //  ================
      //    110.00     USD
      yield services.assertBalance('test2.ledger8.', 'bob', '110')
      yield services.assertBalance('test2.ledger8.', 'mesrop2', '990')
    })

    // this fails because of disabled quote-caching functionality, which will probably return in some form

    it.skip('routes payments to unknown ledgers to nearby connectors', function * () {
      yield services.sendRoutes([{
        source_ledger: 'test2.group1.ledger2.',
        destination_ledger: 'test2.group2.',
        min_message_window: 5,
        source_account: 'test2.group1.ledger2.milo2',
        // This curve is only used for route selection, not for quoting amounts.
        points: [ [0, 0], [1000, 2000] ]
      }], {
        ledger: 'test2.group1.ledger2.',
        connectorName: 'michelle2',
        username: 'milo2',
        password: 'milo2'
      })
      yield services.sendPayment({
        sourceAccount: 'test2.group1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.group2.ledger2.bob',
        sourceAmount: '4.9999',
        destinationPrecision: '10',
        destinationScale: '4'
      })

      // Amounts/calculations (except for the last one) are identical to the "many hops" test.
      yield services.assertBalance('test2.group1.ledger1.', 'alice', '95.0001')
      yield services.assertBalance('test2.group1.ledger1.', 'michelle2', '1004.9999')

      yield services.assertBalance('test2.group1.ledger2.', 'michelle2', '995.0101')
      yield services.assertBalance('test2.group1.ledger2.', 'milo2', '1004.9899')

      yield services.assertBalance('test2.group2.ledger1.', 'milo2', '995.0201')
      yield services.assertBalance('test2.group2.ledger1.', 'miles2', '1004.9799')

      // This isn't 104.9647 because by using an intermediate quote that is
      // nearer to the final ledger we can get a slightly better (i.e. less
      // pessimistic) quote (one less rounding shift).
      yield services.assertBalance('test2.group2.ledger2.', 'bob', '104.9648')
      yield services.assertBalance('test2.group2.ledger2.', 'miles2', '995.0352')
    })

    it('connector rejects a payment with insufficient liquidity', function * () {
      yield services.updateAccount('test2.ledger1.', 'alice', {balance: '1950'})
      // Use up mark's liquidity.
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '950'
      })

      yield services.assertBalance('test2.ledger1.', 'alice', '1000') // 1950 - 950
      yield services.assertBalance('test2.ledger1.', 'mark2', '1950') // 1000 + 950
      yield services.assertBalance('test2.ledger2.', 'bob', '1048.1') // 100 + ~950
      yield services.assertBalance('test2.ledger2.', 'mark2', '51.9') // 1000 - ~950

      let cancelled = false
      // This payment should fail. The quote succeeds without triggering insufficient
      // liquidity because the BalanceCache only updates once per minute.
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '90',
        onOutgoingReject: (transfer, rejectionMessage) => {
          assert.deepEqual(rejectionMessage, {
            code: 'T01',
            name: 'Ledger Unreachable',
            message: 'destination transfer failed: Sender has insufficient funds.',
            triggered_by: 'test2.ledger2.mark2',
            triggered_at: rejectionMessage.triggered_at,
            additional_info: {}
          })
          cancelled = true
        }
      })

      assert(cancelled)

      yield services.assertBalance('test2.ledger1.', 'alice', '1000')
      yield services.assertBalance('test2.ledger1.', 'mark2', '1950')
      yield services.assertBalance('test2.ledger2.', 'bob', '1048.1')
      yield services.assertBalance('test2.ledger2.', 'mark2', '51.9')
    })

    it('receiver rejects a payment with an expired packet', function * () {
      let cancelled = false
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '10',
        overrideMemoParams: { expires_at: (new Date()).toISOString() }, // already expired
        onOutgoingReject: (transfer, rejectionMessage) => {
          assert.deepEqual(rejectionMessage, {
            code: 'R01',
            name: 'Transfer Timed Out',
            message: 'got notification of transfer with expired packet',
            additional_info: {},
            triggered_at: rejectionMessage.triggered_at,
            triggered_by: 'test2.ledger2.bob',
            forwarded_by: 'test2.ledger1.mark2'
          })
          cancelled = true
        }
      })

      assert(cancelled)
      yield services.assertBalance('test2.ledger1.', 'alice', '100')
      yield services.assertBalance('test2.ledger1.', 'mark2', '1000')
      yield services.assertBalance('test2.ledger2.', 'mark2', '1000')
      yield services.assertBalance('test2.ledger2.', 'bob', '100')
    })
  })
})
