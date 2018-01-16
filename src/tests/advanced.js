/* global describe, it, beforeEach, afterEach */
'use strict'
const path = require('path')
const assert = require('assert')
const ServiceManager = require('five-bells-service-manager')

const services = new ServiceManager(path.resolve(process.cwd(), 'node_modules/'))
const {startConnector, startSender, startReceiver, stopPlugins} = require('../lib/helpers')({services})

describe('Advanced', function () {
  afterEach(async function () {
    await stopPlugins()
    // Prevent "Uncaught Error: read ECONNRESET"
    await new Promise((resolve) => setTimeout(resolve, 10))
    services.killAll()
  })

  describe('different scales', function () {
    beforeEach(async function () {
      await startConnector({
        ilpAddress: 'test2.mark',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          ledger2: { relation: 'child', assetScale: 2, options: {port: 3002, currencyScale: 2} }
        }
      })

      this.sender1 = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
      this.sender2 = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3002' })
      this.receiver1 = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3001' })
      this.receiver2 = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    })

    it('high → low', async function () {
      const res = await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver2,
        sourceAmount: '49999'
      })
      assert.equal(res.typeString, 'ilp_fulfill')
      // Bob should have:
      //      49999      USD (money from Alice)
      //  -      99.998  USD (mark: spread/fee)
      //  ==================
      //      49899.002  USD
      //      498        USD (scale 4 → 2)
      services.assertBalance(this.receiver2, '498')
    })

    it('low → high', async function () {
      const res = await services.sendPayment({
        sender: this.sender2,
        receiver: this.receiver1,
        sourceAmount: '499'
      })
      assert.equal(res.typeString, 'ilp_fulfill')
      // Bob should have:
      //      499 USD (money from Alice)
      //  -     1 USD (mark: spread/fee)
      //  ===========
      //      498 USD
      //    49800 USD (scale 2 → 4)
      services.assertBalance(this.receiver1, '49800')
    })
  })

  it('zero spread', async function () {
    await startConnector({
      ilpAddress: 'test2.micah',
      accounts: {
        ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
        ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
      },
      spread: '0'
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    const res = await services.sendPayment({ sender, receiver, sourceAmount: '10' })
    assert.equal(res.typeString, 'ilp_fulfill')
    services.assertBalance(receiver, '10')
  })

  it('high spread', async function () {
    await startConnector({
      ilpAddress: 'test2.martin',
      accounts: {
        ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
        ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
      },
      spread: '0.5'
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    const res = await services.sendPayment({ sender, receiver, sourceAmount: '500' })
    assert.equal(res.typeString, 'ilp_fulfill')
    //      500 USD (money from Alice)
    //  -   250 USD (martin: spread/fee)
    //  ===========
    //      250 USD
    services.assertBalance(receiver, '250')
  })

  it('many hops', async function () {
    await Promise.all([
      startConnector({
        ilpAddress: 'test2.mia',
        accounts: {
          millie: { relation: 'peer', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} },
          mike: { relation: 'peer', assetScale: 4, options: {listener: {port: 3101, secret: 'secret'}} }
        }
      }),
      startConnector({
        ilpAddress: 'test2.millie',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3100'} }
        }
      }),
      startConnector({
        ilpAddress: 'test2.mike',
        accounts: {
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3101'} }
        }
      })
    ])

    // Send payment ledger1 → millie → mia → mike → ledger2
    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    const res = await services.sendPayment({ sender, receiver, sourceAmount: '49999' })
    assert.equal(res.typeString, 'ilp_fulfill')
    //    49999.000     USD (original amount from Alice)
    //  ×     0.998         (millie: spread/fee; 0.998 = 1 - 0.002)
    //  ×     0.998         (mia: spread/fee)
    //  ×     0.998         (mike: spread/fee)
    //  -     1.0       USD (mia rounding in her own favor)
    //  -     1.0       USD (mike rounding in his own favor)
    //  ===================
    //    49697.6055880 USD
    //    49697         USD (round destination down)
    services.assertBalance(receiver, '49697')
  })

  it('static route', async function () {
    await Promise.all([
      startConnector({
        ilpAddress: 'test2.mia',
        accounts: {
          millie: { relation: 'peer', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} },
          mike: { relation: 'peer', assetScale: 4, options: {listener: {port: 3101, secret: 'secret'}} }
        }
      }),
      startConnector({
        ilpAddress: 'test2.millie',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          mia: {
            relation: 'peer',
            assetScale: 4,
            options: {server: 'btp+ws://:secret@127.0.0.1:3100'},
            receiveRoutes: false
          }
        },
        routes: [{targetPrefix: 'test2.mike.ledger2.', peerId: 'mia'}]
      }),
      startConnector({
        ilpAddress: 'test2.mike',
        accounts: {
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3101'} }
        }
      })
    ])

    // Send payment ledger1 → millie → mia → mike → ledger2
    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    const res = await services.sendPayment({ sender, receiver, sourceAmount: '49999' })
    assert.equal(res.typeString, 'ilp_fulfill')
    services.assertBalance(receiver, '49697')
  })

  it('rate check', async function () {
    await startConnector({
      ilpAddress: 'test2.mesrop',
      accounts: {
        ledger1: { relation: 'child', assetScale: 2, options: {port: 3001, currencyScale: 2} },
        ledger2: { relation: 'child', assetScale: 2, options: {port: 3002, currencyScale: 2} }
      },
      spread: (1 - 0.877980).toFixed(8)
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    const res = await services.sendPayment({ sender, receiver, sourceAmount: '1000' })
    assert.equal(res.typeString, 'ilp_fulfill')
    // Bob should have:
    //    1000        USD (money from Alice)
    //  ×    0.877980     (mesrop: spread/fee; 10 * 0.877980 = 8.7798)
    //  =================
    //     877.980    USD
    //     877        USD (round destination amount down)
    services.assertBalance(receiver, '877')
  })

  it.skip('connector rejects a payment with insufficient liquidity', async function () {
    await services.updateAccount('test2.ledger1.', 'alice', {balance: '1950'})
    // Use up mark's liquidity.
    await services.sendPayment({
      sourceAccount: 'test2.ledger1.alice',
      sourcePassword: 'alice',
      destinationAccount: 'test2.ledger2.bob',
      sourceAmount: '950'
    })

    await services.assertBalance('test2.ledger1.', 'alice', '1000') // 1950 - 950
    await services.assertBalance('test2.ledger1.', 'mark2', '1950') // 1000 + 950
    await services.assertBalance('test2.ledger2.', 'bob', '1048.1') // 100 + ~950
    await services.assertBalance('test2.ledger2.', 'mark2', '51.9') // 1000 - ~950

    let cancelled = false
    // This payment should fail. The quote succeeds without triggering insufficient
    // liquidity because the BalanceCache only updates once per minute.
    await services.sendPayment({
      sourceAccount: 'test2.ledger1.alice',
      sourcePassword: 'alice',
      destinationAccount: 'test2.ledger2.bob',
      sourceAmount: '90',
      onOutgoingReject: (transfer, rejectionMessage) => {
        assert.deepEqual(rejectionMessage, {
          code: 'T04',
          name: 'Insufficient Liquidity',
          message: 'destination transfer failed: Sender has insufficient funds.',
          triggered_by: 'test2.ledger2.mark2',
          triggered_at: rejectionMessage.triggered_at,
          additional_info: {}
        })
        cancelled = true
      }
    })

    assert(cancelled)

    await services.assertBalance('test2.ledger1.', 'alice', '1000')
    await services.assertBalance('test2.ledger1.', 'mark2', '1950')
    await services.assertBalance('test2.ledger2.', 'bob', '1048.1')
    await services.assertBalance('test2.ledger2.', 'mark2', '51.9')
  })
})
