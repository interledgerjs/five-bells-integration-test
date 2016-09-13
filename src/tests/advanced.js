/*global describe, it, beforeEach, before*/
'use strict'
const assert = require('assert')
const Promise = require('bluebird')
const ServiceManager = require('../lib/service-manager')
const ServiceGraph = require('../lib/service-graph')

const services = new ServiceManager(process.cwd())
const graph = new ServiceGraph(services)

const notarySecretKey = 'lRmSmT/I2SS5I7+FnFgHbh8XZuu4NeL0wk8oN86L50U='
const notaryPublicKey = '4QRmhUtrxlwQYaO+c8K2BtCd6c4D8HVmy5fLDSjsH6A='
const receiverSecret = 'O8Y6+6bJgl2i285yCeC/Wigi6P6TJ4C78tdASqDOR9g='

describe('Advanced', function () {
  before(function * () {
    yield graph.startLedger('test2.ledger1.', 3101, {scale: 4})
    yield graph.startLedger('test2.ledger2.', 3102, {scale: 2})
    yield graph.startLedger('test2.ledger3.', 3103, {scale: 4})
    yield graph.startLedger('test2.ledger4.', 3104, {scale: 4})

    yield graph.startLedger('test2.ledger5.', 3105, {scale: 4})
    yield graph.startLedger('test2.ledger6.', 3106, {scale: 4})
    yield graph.startLedger('test2.ledger7.', 3107, {scale: 4})

    yield graph.startLedger('test2.ledger8.', 3108, {scale: 2})

    yield graph.startLedger('test2.group1.ledger1.', 3109, {scale: 4})
    yield graph.startLedger('test2.group1.ledger2.', 3110, {scale: 4})
    yield graph.startLedger('test2.group2.ledger1.', 3111, {scale: 4})
    yield graph.startLedger('test2.group2.ledger2.', 3112, {scale: 4})

    yield graph.setupAccounts()

    yield graph.startConnector('mark2', 4101, {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger2.'}]
    })

    yield graph.startConnector('mary2', 4102, {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger3.'}],
      slippage: '0'
    })

    yield graph.startConnector('martin2', 4103, {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger4.'}],
      fxSpread: '0.5'
    })

    yield graph.startConnector('millie2', 4104, {
      edges: [{source: 'test2.ledger1.', target: 'test2.ledger5.'}]
    })
    yield graph.startConnector('mia2', 4105, {
      edges: [{source: 'test2.ledger5.', target: 'test2.ledger6.'}]
    })
    yield graph.startConnector('mike2', 4106, {
      edges: [{source: 'test2.ledger6.', target: 'test2.ledger7.'}]
    })

    yield graph.startConnector('mesrop2', 4107, {
      edges: [{source: 'test2.ledger2.', target: 'test2.ledger8.'}],
      fxSpread: (1 - 0.877980).toFixed(8),
      slippage: '0'
    })

    yield graph.startConnector('michelle2', 4108, {
      edges: [{source: 'test2.group1.ledger1.', target: 'test2.group1.ledger2.'}]
    })
    yield graph.startConnector('milo2', 4109, {
      edges: [{source: 'test2.group1.ledger2.', target: 'test2.group2.ledger1.'}],
      routeBroadcastEnabled: false
    })
    yield graph.startConnector('miles2', 4110, {
      edges: [{source: 'test2.group2.ledger1.', target: 'test2.group2.ledger2.'}]
    })

    yield services.startNotary('notary2_1', 6101, {
      secretKey: notarySecretKey,
      publicKey: notaryPublicKey
    })

    yield graph.startReceivers({secret: receiverSecret})
  })

  beforeEach(function * () { yield graph.setupAccounts() })

  describe('send universal payment', function () {
    it('scale: high → low; by source amount', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '4.9999'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   4.9999 USD (sent to Bob)
      //  ==============
      //     95.0001 USD
      yield services.assertBalance('http://localhost:3101', 'alice', '95.0001')
      yield services.assertBalance('http://localhost:3101', 'mark2', '1004.9999')

      // Bob should have:
      //    100       USD
      //  +   4.9999  USD (money from Alice)
      //  -   0.0099‥ USD (mark: spread/fee)
      //  -   0.0049‥ USD (mark: quoted connector slippage)
      //  ===============
      //    104.9851  USD
      //    104.98    USD (round down)
      yield services.assertBalance('http://localhost:3102', 'bob', '104.98')
      yield services.assertBalance('http://localhost:3102', 'mark2', '995.02')
      yield graph.assertZeroHold()
    })

    it('scale: low → high', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger1.bob',
        sourceAmount: '4.99'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   4.99   USD (sent to Bob)
      //  ==============
      //     95.01   USD
      yield services.assertBalance('http://localhost:3102', 'alice', '95.01')
      yield services.assertBalance('http://localhost:3102', 'mark2', '1004.99')

      // Bob should have:
      //    100       USD
      //  +   4.99    USD (money from Alice)
      //  -   0.00998 USD (mark: spread/fee)
      //  -   0.00498 USD (mark: quoted connector slippage; (4.99 - 0.00998) * 0.001 = 0.00498002)
      //  ===============
      //    104.97504 USD
      //    104.9750  USD (round destination amount down)
      yield services.assertBalance('http://localhost:3101', 'bob', '104.975')
      yield services.assertBalance('http://localhost:3101', 'mark2', '995.025')
      yield graph.assertZeroHold()
    })

    it('zero slippage', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger3.bob',
        sourceAmount: '5'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('http://localhost:3101', 'alice', '95')
      yield services.assertBalance('http://localhost:3101', 'mary2', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   0.01   USD (mary: spread/fee)
      //  -   0      USD (mary: quoted connector slippage)
      //  ==============
      //    104.9900 USD
      yield services.assertBalance('http://localhost:3103', 'bob', '104.99')
      yield services.assertBalance('http://localhost:3103', 'mary2', '995.01')
      yield graph.assertZeroHold()
    })

    it('high spread', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger4.bob',
        sourceAmount: '5'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   5      USD (sent to Bob)
      //  ==============
      //     95      USD
      yield services.assertBalance('http://localhost:3101', 'alice', '95')
      yield services.assertBalance('http://localhost:3101', 'martin2', '1005')

      // Bob should have:
      //    100      USD
      //  +   5      USD (money from Alice)
      //  -   2.5    USD (martin: spread/fee)
      //  -   0.0025 USD (martin: quoted connector slippage; (5 - 2.5) * 0.001)
      //  ==============
      //    102.4975 USD
      yield services.assertBalance('http://localhost:3104', 'bob', '102.4975')
      yield services.assertBalance('http://localhost:3104', 'martin2', '997.5025')
      yield graph.assertZeroHold()
    })

    it('many hops', function * () {
      // Send payment 1→5→6→7
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger7.bob',
        sourceAmount: '4.9999',
        destinationPrecision: '10',
        destinationScale: '4'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100      USD
      //  -   4.9999 USD (sent to Bob)
      //  ==============
      //     95.0001 USD
      yield services.assertBalance('http://localhost:3101', 'alice', '95.0001')
      yield services.assertBalance('http://localhost:3101', 'millie2', '1004.9999')

      // Mia should have:
      //   1000         USD
      //  +   4.9999    USD (sent from Millie)
      //  -   0.0099998 USD (millie: spread/fee 1→5; 4.9999*0.002)
      //  =================
      //   1004.9899002 USD
      //   1004.9899    USD (round destination amount down)
      yield services.assertBalance('http://localhost:3105', 'millie2', '995.0101')
      yield services.assertBalance('http://localhost:3105', 'mia2', '1004.9899')

      // Mark should have:
      //   1000           USD
      //  +   4.9899      USD (sent from Mia)
      //  -   0.009979799 USD (mia: spread/fee 5→6; 4.9899*0.002)
      //  ===================
      //   1004.9799202   USD
      //   1004.9799      USD (round destination amount down)
      yield services.assertBalance('http://localhost:3106', 'mia2', '995.0201')
      yield services.assertBalance('http://localhost:3106', 'mike2', '1004.9799')

      // Bob should have:
      //    100         USD
      //  +   4.9999    USD (original amount from Alice)
      //  ×   0.998         (millie: spread/fee 1→5; 0.998 = 1 - 0.002)
      //  ×   0.998         (mia: spread/fee 5→6)
      //  -   0.0001    USD (mia: 1/10^ledger6_scale)
      //  ×   0.998         (mike: spread/fee 6→7)
      //  -   0.0001    USD (mike: 1/10^ledger7_scale)
      //  ×   0.999         (millie: quoted connector slippage; 0.999 = 1 - 0.001)
      //  =================
      //    104.9647909 USD
      //    104.9647    USD (round destination down)
      yield services.assertBalance('http://localhost:3107', 'bob', '104.9647')
      yield services.assertBalance('http://localhost:3107', 'mike2', '995.0353')
      yield graph.assertZeroHold()
    })

    it('rate check (by source amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger8.bob',
        sourceAmount: '10'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100        USD
      //  -  10        USD (sent to Bob)
      //  ================
      //     90        USD
      yield services.assertBalance('http://localhost:3102', 'alice', '90')
      yield services.assertBalance('http://localhost:3102', 'mesrop2', '1010')

      // Bob should have:
      //    100        USD
      //  +  10        USD (money from Alice)
      //  *   0.877980     (mesrop: spread/fee; 10 * 0.877980 = 8.7798)
      //  ================
      //    108.7798   USD
      //    108.77     USD (round destination amount down)
      yield services.assertBalance('http://localhost:3108', 'bob', '108.77')
      yield services.assertBalance('http://localhost:3108', 'mesrop2', '991.23')
      yield graph.assertZeroHold()
    })

    it('rate check (by destination amount)', function * () {
      yield services.sendPayment({
        sourceAccount: 'test2.ledger2.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger8.bob',
        destinationAmount: '10'
      })
      yield Promise.delay(2000)
      // Alice should have:
      //    100        USD
      //  -  10        USD (sent to Bob)
      //  ÷   0.877980     (mesrop: spread/fee; 10 / 0.877980 = 11.389781088407481)
      //  ================
      //     88.610218 USD
      //     88.61     USD (round source amount up (round source balance down))
      yield services.assertBalance('http://localhost:3102', 'alice', '88.61')
      yield services.assertBalance('http://localhost:3102', 'mesrop2', '1011.39')

      // Bob should have:
      //    100        USD
      //  +  10        USD (money from Alice)
      //  ================
      //    110.00     USD
      yield services.assertBalance('http://localhost:3108', 'bob', '110')
      yield services.assertBalance('http://localhost:3108', 'mesrop2', '990')
      yield graph.assertZeroHold()
    })

    it('routes payments to unknown ledgers to nearby connectors', function * () {
      yield services.sendRoutes('http://localhost:4108', [{
        source_ledger: 'test2.group1.ledger2.',
        destination_ledger: 'test2.group2.',
        connector: 'http://localhost:4109',
        min_message_window: 5,
        source_account: 'test2.group1.ledger2.milo2',
        // This curve is only used for route selection, not for quoting amounts.
        points: [ [0, 0], [1000, 2000] ]
      }])
      yield services.sendPayment({
        sourceAccount: 'test2.group1.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.group2.ledger2.bob',
        sourceAmount: '4.9999',
        destinationPrecision: '10',
        destinationScale: '4'
      })
      yield Promise.delay(2000)

      // Amounts/calculations (except for the last one) are identical to the "many hops" test.
      yield services.assertBalance('http://localhost:3109', 'alice', '95.0001')
      yield services.assertBalance('http://localhost:3109', 'michelle2', '1004.9999')

      yield services.assertBalance('http://localhost:3110', 'michelle2', '995.0101')
      yield services.assertBalance('http://localhost:3110', 'milo2', '1004.9899')

      yield services.assertBalance('http://localhost:3111', 'milo2', '995.0201')
      yield services.assertBalance('http://localhost:3111', 'miles2', '1004.9799')

      // This isn't 104.9647 because by using an intermediate quote that is
      // nearer to the final ledger we can get a slightly better (i.e. less
      // pessimistic) quote (one less rounding shift).
      yield services.assertBalance('http://localhost:3112', 'bob', '104.9648')
      yield services.assertBalance('http://localhost:3112', 'miles2', '995.0352')
    })

    it('connector rejects a payment with insufficient liquidity', function * () {
      yield services.updateAccount('http://localhost:3101', 'alice', {balance: '1950'})
      // Use up mark's liquidity.
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '950'
      })
      yield Promise.delay(2000)

      yield services.assertBalance('http://localhost:3101', 'alice', '1000') // 1950 - 950
      yield services.assertBalance('http://localhost:3101', 'mark2', '1950') // 1000 + 950
      yield services.assertBalance('http://localhost:3102', 'bob', '1047.15') // 100 + ~950
      yield services.assertBalance('http://localhost:3102', 'mark2', '52.85') // 1000 - ~950

      let cancelled = false
      // This payment should fail. The quote succeeds without triggering insufficient
      // liquidity because the BalanceCache only updates once per minute.
      yield services.sendPayment({
        sourceAccount: 'test2.ledger1.alice',
        sourcePassword: 'alice',
        destinationAccount: 'test2.ledger2.bob',
        sourceAmount: '90',
        onOutgoingCancel: (transfer, reason) => {
          assert.equal(reason, 'destination transfer failed: Remote error: status=422')
          cancelled = true
        }
      })
      yield Promise.delay(2000)
      assert(cancelled)

      yield services.assertBalance('http://localhost:3101', 'alice', '1000')
      yield services.assertBalance('http://localhost:3101', 'mark2', '1950')
      yield services.assertBalance('http://localhost:3102', 'bob', '1047.15')
      yield services.assertBalance('http://localhost:3102', 'mark2', '52.85')
      yield graph.assertZeroHold()
    })
  })
})
