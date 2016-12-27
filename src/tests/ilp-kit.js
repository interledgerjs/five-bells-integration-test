/*global describe, it, beforeEach, before, after*/
'use strict'

const path = require('path')
// const assert = require('assert')
const ServiceManager = require('five-bells-service-manager')
// const ServiceGraph = require('../lib/service-graph')

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))

const HOSTNAME = 'wallet1.com'
const API_PORT = 3010

describe('ILP-Kit Test Suite', function () {
  before(function * () {
    this.kit = yield services.startKit(HOSTNAME, API_PORT)
  })

  beforeEach(function () {})

  after(function () {
    // stop ilp-kits
  })

  describe('API test suite', function () {
    describe('User tests', function () {
      it('gets a user', function () {
        // kit.
      })

      it('creates a user', function () {
      // 1) create a user
      // 2) get the user
      // 3) compare expected user with actual
      })

      it('updates a user', function () {

      })

      it('sends verification email', function () {

      })

      it('verifies user email', function () {

      })
    })

    describe('Payment tests', function () {
      it('requests a quote', function () {

      })

      it('makes a payment', function () {

      })

      it('gets a user\'s payment history', function () {

      })
    })

    describe('Misc tests', function () {

    })

    describe('Auth tests', function () {

    })

    describe('Receiver tests', function () {

    })
  })
})
