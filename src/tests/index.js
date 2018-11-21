/* global describe, it, beforeEach, afterEach */
'use strict'
const path = require('path')
const assert = require('assert')
const ServiceManager = require('five-bells-service-manager')

const services = new ServiceManager(path.resolve(process.cwd(), 'node_modules/'))
const {startConnector, startSender, startReceiver, stopPlugins, routesReady} = require('../lib/helpers')({services})

describe('Basic', function () {
  beforeEach(async function () {
    await Promise.all([
      startConnector({
        ilpAddress: 'test.mark',
        accounts: {
          ledger1: { relation: 'child', assetScale: 4, options: {port: 3001, currencyScale: 4} },
          ledger2: { relation: 'child', assetScale: 4, options: {port: 3002, currencyScale: 4} },
          mary: { relation: 'peer', assetScale: 4, options: {listener: {port: 3100, secret: 'secret'}} }
        }
      }),
      startConnector({
        ilpAddress: 'test.mary',
        accounts: {
          mark: { relation: 'peer', assetScale: 4, options: {server: 'btp+ws://:secret@127.0.0.1:3100'} },
          ledger3: { relation: 'child', assetScale: 4, options: {port: 3003, currencyScale: 4} }
        }
      })
    ])
    this.sender1 = await startSender({ server: 'btp+ws://:alice_secret@127.0.0.1:3001' })
    this.receiver1 = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3001' })
    this.receiver2 = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3002' })
    this.receiver3 = await startReceiver({ server: 'btp+ws://:bob_secret@127.0.0.1:3003' })
  })

  afterEach(async function () {
    await stopPlugins()
    // Prevent "Uncaught Error: read ECONNRESET"
    await new Promise((resolve) => setTimeout(resolve, 10))
    services.killAll()
  })

  describe('send universal payment', function () {
    it('transfers the funds (by destination amount)', async function () {
      const res = await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver2,
        destinationAmount: '5'
      })
      assert.equal(res.typeString, 'ilp_fulfill')
      services.assertBalance(this.receiver2, '5')
    }).skip()

    it('transfers the funds (by source amount)', async function () {
      services.assertBalance(this.receiver2, 0)

      await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver2,
        sourceAmount: '500'
      })
      // assert.equal(res.typeString, 'ilp_fulfill')
      // +   500  USD (money from Alice)
      // -     1  USD (connector spread/fee)
      // ============
      //     499  USD
      services.assertBalance(this.receiver2, 499)
    })

    it('transfers the funds (by source amount, round destination down)', async function () {
      services.assertBalance(this.receiver2, 0)

      await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver2,
        sourceAmount: '5'
      })

      services.assertBalance(this.receiver2, 4)
    })

    it('transfers a payment with 3 steps', async function () {
      // Give route broadcasts a chance to succeed
      await routesReady(this.sender1, this.receiver3)

      await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver3,
        destinationAmount: '5'
      })

      services.assertBalance(this.receiver3, 5)
    }).skip()
  })

  describe('send same-ledger payment', function () {
    it('transfers the funds (by destination amount)', async function () {
      const res = await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver1,
        destinationAmount: '5'
      })
      assert.equal(res.typeString, 'ilp_fulfill')
      services.assertBalance(this.receiver1, '5')
    }).skip()

    it('transfers the funds (by source amount)', async function () {
      services.assertBalance(this.receiver1, 0)

      await services.sendPayment({
        sender: this.sender1,
        receiver: this.receiver1,
        sourceAmount: '500'
      })

      services.assertBalance(this.receiver1, 499)
    })
  })
})
