/* global describe, it, beforeEach, afterEach */
'use strict'
const path = require('path')
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
        ilpAddress: 'test.mark',
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
      services.assertBalance(this.receiver2, 0)

      await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver2,
        sourceAmount: '49999'
      })
      // Bob should have:
      //      49999      USD (money from Alice)
      //  -      99.998  USD (mark: spread/fee)
      //  ==================
      //      49899.002  USD
      //      498        USD (scale 4 → 2)
      services.assertBalance(this.receiver2, 498)
    })

    it('low → high', async function () {
      services.assertBalance(this.receiver1, 0)

      await services.sendPayment({
        sender: this.sender2,
        receiver: this.receiver1,
        sourceAmount: '499'
      })

      // Bob should have:
      //      499 USD (money from Alice)
      //  -     1 USD (mark: spread/fee)
      //  ===========
      //      498 USD
      //    49800 USD (scale 2 → 4)
      services.assertBalance(this.receiver1, 49800)
    })
  })

  it('zero spread', async function () {
    await startConnector({
      ilpAddress: 'test.micah',
      accounts: {
        ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
        ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
      },
      spread: '0'
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    await services.sendPayment({ sender, receiver, sourceAmount: '10' })
    services.assertBalance(receiver, 10)
  })

  it('high spread', async function () {
    await startConnector({
      ilpAddress: 'test.martin',
      accounts: {
        ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
        ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
      },
      spread: '0.5'
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    services.assertBalance(receiver, 0)

    await services.sendPayment({ sender, receiver, sourceAmount: '500' })
    //      500 USD (money from Alice)
    //  -   250 USD (martin: spread/fee)
    //  ===========
    //      250 USD
    services.assertBalance(receiver, 250)
  })

  it('many hops', async function () {
    await Promise.all([
      startConnector({
        ilpAddress: 'test.mia',
        accounts: {
          millie: { relation: 'peer', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} },
          mike: { relation: 'peer', assetScale: 4, options: {listener: {port: 3101, secret: 'secret'}} }
        }
      }),
      startConnector({
        ilpAddress: 'test.millie',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3100'} }
        }
      }),
      startConnector({
        ilpAddress: 'test.mike',
        accounts: {
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3101'} }
        }
      })
    ])

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Send payment ledger1 → millie → mia → mike → ledger2
    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })

    // Wait to send payment until the routes are all ready.
    // await routesReady(sender, receiver)

    await services.sendPayment({ sender, receiver, sourceAmount: '49999' })
    //    49999.000     USD (original amount from Alice)
    //  ×     0.998         (millie: spread/fee; 0.998 = 1 - 0.002)
    //  ×     0.998         (mia: spread/fee)
    //  ×     0.998         (mike: spread/fee)
    //  -     1.0       USD (mia rounding in her own favor)
    //  -     1.0       USD (mike rounding in his own favor)
    //  ===================
    //    49697.6055880 USD
    //    49697         USD (round destination down)
    services.assertBalance(receiver, 49699)
  })

  it('static route', async function () {
    await Promise.all([
      startConnector({
        ilpAddress: 'test.mia',
        accounts: {
          millie: { relation: 'peer', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} },
          mike: { relation: 'peer', assetScale: 4, options: {listener: {port: 3101, secret: 'secret'}} }
        }
      }),
      startConnector({
        ilpAddress: 'test.millie',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          mia: {
            relation: 'peer',
            assetScale: 4,
            options: {server: 'btp+ws://:secret@127.0.0.1:3100'},
            receiveRoutes: false
          }
        },
        routes: [{targetPrefix: 'test.mike.ledger2', peerId: 'mia'}]
      }),
      startConnector({
        ilpAddress: 'test.mike',
        accounts: {
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} },
          mia: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3101'} }
        }
      })
    ])

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Send payment ledger1 → millie → mia → mike → ledger2
    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })

    // await routesReady(sender, receiver)

    await services.sendPayment({ sender, receiver, sourceAmount: '49999' })
    services.assertBalance(receiver, 49699)
  })

  it('rate check', async function () {
    await startConnector({
      ilpAddress: 'test.mesrop',
      accounts: {
        ledger1: { relation: 'child', assetScale: 2, options: {port: 3001, currencyScale: 2} },
        ledger2: { relation: 'child', assetScale: 2, options: {port: 3002, currencyScale: 2} }
      },
      spread: (1 - 0.877980).toFixed(8)
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    await services.sendPayment({ sender, receiver, sourceAmount: '1000' })

    // Bob should have:
    //    1000        USD (money from Alice)
    //  ×    0.877980     (mesrop: spread/fee; 10 * 0.877980 = 8.7798)
    //  =================
    //     877.980    USD
    //     877        USD (round destination amount down)
    services.assertBalance(receiver, 877)
  })

  it('parent connector', async function () {
    await Promise.all([
      startConnector({
        _name: 'test.millie',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          mike: { relation: 'parent', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3100'} }
        }
      }),
      startConnector({
        ilpAddress: 'test.mike',
        accounts: {
          millie: { relation: 'child', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} },
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
        }
      })
    ])

    // Send payment ledger1 → millie → mike → ledger2
    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    await services.sendPayment({ sender, receiver, sourceAmount: '49999' })
    //    49999.000     USD (original amount from Alice)
    //  ×     0.998         (millie: spread/fee; 0.998 = 1 - 0.002)
    //  ×     0.998         (mike: spread/fee)
    //  -     1.0       USD (mike rounding in his own favor) //
    //  ===================
    //    49798.2039960 USD
    //    49798         USD (round destination down)
    services.assertBalance(receiver, 49799)
  })

  it('connector rejects payment when payment exceeds maximum debt', async function () {
    await startConnector({
      ilpAddress: 'test.mark',
      accounts: {
        ledger1: {
          relation: 'child',
          assetScale: 4,
          balance: {maximum: '1000'},
          options: {port: 3001, currencyScale: 4}
        },
        ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} }
      }
    })

    const sender = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    const receiver = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })

    await services.sendPayment({
      sender: sender,
      receiver: receiver,
      sourceAmount: '49999'
    })

    services.assertBalance(receiver, 0)
    // TODO need to handle the stream error and propagate it down to this level
    // Currently throwing error in ilp-protocol-stream/connection/determineExchangeRate() in
  }).skip()
})
