/*global describe, it, beforeEach, before, after*/
'use strict'

const path = require('path')
// const assert = require('assert')
const ServiceManager = require('five-bells-service-manager')
const KitManager = require('../lib/kit-manager')
// const fs = require('fs')
const request = require('superagent')
const assert = require('assert')

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const kitManager = new KitManager(services)

const configFiles = [ require.resolve('../tests/data/kit1-env.list'),
                      require.resolve('../tests/data/kit2-env.list'),
                      require.resolve('../tests/data/kit3-env.list')]

// sleep time expects milliseconds
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

describe('ILP Kit Test Suite -', function () {
  before(function * () {
    try {
      let startupPromises = []
      for (const config of configFiles) {
        const p = kitManager.startKit(config)
        startupPromises.push(p)
      }
      yield Promise.all(startupPromises)
      yield sleep(10000) // let the ilp-kits start
    } catch (e) {
      console.log(e)
    }
  })

  beforeEach(function * () {
    try {
      yield kitManager.setupAccounts()
    } catch (e) { console.log(e) }
    yield sleep(1000)
  })

  after(function * () { services.killAll() })

  describe('User API -', function () {
    it('Gets a user', function * () {
      const config = kitManager.kits[0]
      const expectedUser = 'alice'
      const resp = yield request
        .get(`http://${config.API_HOSTNAME}:${config.API_PORT}/users/${expectedUser}`)
        .auth(expectedUser, expectedUser)

      const expectedStatus = 200
      assert.equal(resp.statusCode, expectedStatus, `HTTP status code is ${resp.statusCode}, 
        but expected is ${expectedStatus}`)
      assert.equal(resp.body.username, expectedUser, `Username is ${resp.body.username}, 
        but expected is ${expectedUser}`)
    })

    it('Creates a user', function * () {
      const config = kitManager.kits[0]
      const expectedUser = 'daryl'
      const resp = yield request
        .post(`http://${config.API_HOSTNAME}:${config.API_PORT}/users/${expectedUser}`)
        .auth('admin', 'admin')
        .send({
          username: 'daryl',
          email: 'daryl@some.example',
          password: 'daryl'
        })

      const expectedStatus = 201
      assert.equal(resp.statusCode, expectedStatus, `HTTP status code is ${resp.statusCode}, 
        but expected is ${expectedStatus}`)
      assert.equal(resp.body.username, expectedUser, `Username is ${resp.body.username}, 
        but expected is ${expectedUser}`)
      yield kitManager.assertBalance(kitManager.kits[0], 'daryl', '0')
    })

    it('updates a user', function * () {
      const config = kitManager.kits[0]
      const expectedMail = 'alice@alice.example'
      const expectedName = 'AliceAlice'
      const resp = yield request
        .put(`http://${config.API_HOSTNAME}:${config.API_PORT}/users/alice`)
        .auth('alice', 'alice')
        .send({
          email: expectedMail,
          name: expectedName,
          password: 'alice'
        })

      const expectedStatus = 200
      assert.equal(resp.statusCode, expectedStatus, `HTTP status code is ${resp.statusCode}, 
        but expected is ${expectedStatus}`)
      assert.equal(resp.body.name, expectedName, `Name is ${resp.body.username}, 
        but expected is ${expectedName}`)
      assert.equal(resp.body.email, expectedMail, `Mail is ${resp.body.username}, 
        but expected is ${expectedMail}`)
    })
  })
})
