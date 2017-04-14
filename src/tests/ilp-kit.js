/*global describe, it, beforeEach, before, after*/
'use strict'

const path = require('path')
const ServiceManager = require('five-bells-service-manager')
const KitManager = require('../lib/kit-manager')
const request = require('superagent')
const assert = require('assert')
const spawn = require('co-child-process')

const services = new ServiceManager(
  path.resolve(process.cwd(), 'node_modules/'),
  path.resolve(process.cwd(), 'data/'))
const kitManager = new KitManager(services)

const configFiles = [ require.resolve('../tests/data/kit1-env.list'),
                      require.resolve('../tests/data/kit2-env.list')]
                      // if more complex test cases require more ilp kit instances,
                      // add more env.list files below.
                      // require.resolve('../tests/data/kit3-env.list')]

// sleep time expects milliseconds
function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

function assertStatusCode (resp, expectedStatus) {
  assert.equal(resp.statusCode, expectedStatus, `HTTP status code is ${resp.statusCode}, 
        but expected is ${expectedStatus}`)
}

// sets up Apache as a reverse-proxy and for handling SSL connections
function * setupApache () {
  const image = process.env.CIRCLE_BUILD_IMAGE
  if (!image) {
    console.log('WARN: Not running on CircleCI. ' +
      'Please setup Apache configuration manually.')
  } else if (image !== 'ubuntu-14.04') {
    throw new Error('Incompatible build image, use Ubuntu 14.04 instead.')
  } else {
    try {
      const scriptPath = require.resolve('../../assets/ci/setup_ssl.sh')
      const scriptDir = path.resolve(scriptPath, '..')
      yield spawn('sh', [scriptPath], {
        cwd: scriptDir,
        stdio: 'inherit'
      })
    } catch (e) {
      throw new Error('Failed to setup Apache as a reverse-proxy: ' + e.message)
    }
  }
}

// setup peering between ILP kits
function * peer () {
  let success = false
  let tries = 8
  // retry the peering a couple of times
  while (!success && tries-- > 0) {
    try {
      yield kitManager.setupPeering(kitManager.kits[0], kitManager.kits[1], {
        limit: 200,
        currency: 'USD'
      })
      success = true
    } catch (err) {
      yield sleep(2000) // wait before retrying
    }
  }

  if (!success) {
    throw new Error(`Could not peer ${kitManager.kits[0].API_HOSTNAME} with` +
      `${kitManager.kits[1].API_HOSTNAME}`)
  } else {
    console.log('Peering succeeded')
  }
}

describe('ILP Kit Test Suite -', function () {
  before(function * () {
    // accept self-signed certificates
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0

    yield setupApache()

    let startupPromises = []
    for (const config of configFiles) {
      const p = kitManager.startKit(config)
      startupPromises.push(p)
    }
    yield Promise.all(startupPromises)

    yield peer()

    // wait until routes are broadcasted
    let maxBroadcastInterval = 0
    for (const c of kitManager.kits) {
      const interval = c.CONNECTOR_ROUTE_BROADCAST_INTERVAL ||
                        30000 // 30000 is the connector default
      if (interval > maxBroadcastInterval) {
        maxBroadcastInterval = interval
      }
    }
    yield sleep(maxBroadcastInterval)
  })

  beforeEach(function * () {
    try {
      yield kitManager.setupAccounts()
    } catch (e) { console.log(e) }
  })

  after(function * () {
    // turn back on certificate check
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 1
    services.killAll()
  })

  describe('User API -', function () {
    it('Get a user', function * () {
      const config = kitManager.kits[0]
      const expectedUser = 'alice'
      const resp = yield request
        .get(`http://${config.API_HOSTNAME}:${config.API_PORT}/users/${expectedUser}`)
        .auth(expectedUser, expectedUser)

      const expectedStatus = 200
      assertStatusCode(resp, expectedStatus)

      assert.equal(resp.body.username, expectedUser, `Username is ${resp.body.username}, 
        but expected is ${expectedUser}`)
    })

    it('Create a user', function * () {
      const config = kitManager.kits[0]
      const expectedUser = 'daryl'
      const resp = yield kitManager.createUser(config, {
        username: expectedUser,
        email: 'daryl@some.example',
        password: 'daryl'
      })

      const expectedStatus = 201
      assertStatusCode(resp, expectedStatus)

      assert.equal(resp.body.username, expectedUser, `Username is ${resp.body.username}, 
        but expected is ${expectedUser}`)
      yield kitManager.assertBalance(kitManager.kits[0], expectedUser, 0)
    })

    it('Create a user for which a ledger account already exists', function * () {
      const config = kitManager.kits[0]
      const user = 'lenny'
      const expectedErrorId = 'UsernameTakenError'

      // create ledger account
      services.updateAccount(config.LEDGER_ILP_PREFIX, user)
      // check that the user is not created on the ilp kit
      let actualErrorId = ''
      try {
        yield kitManager.createUser(config, {
          username: user,
          password: 'newPassw0rd'
        })
      } catch (err) {
        actualErrorId = err.response.body.id
      }
      assert.deepStrictEqual(actualErrorId, expectedErrorId,
        'Expected an error of type ' + expectedErrorId + ', but was ' + actualErrorId)
    })

    it('Create a user with an invite code', function * () {
      const config = kitManager.kits[0]

      const expectedUser = 'carol'
      const expectedInviteAmount = 222

      const code = yield kitManager.createInvite(config, expectedInviteAmount)

      // since the connector was just paid 1000 on creation,
      // have to wait a bit before paying 222 to this user
      // due to https://github.com/interledgerjs/five-bells-ledger/issues/402
      yield sleep(1000)
      const resp = yield kitManager.createUser(config, {
        username: expectedUser,
        email: 'some@email.example',
        password: 'Passw0rd',
        inviteCode: code
      })

      const expectedStatus = 201
      assertStatusCode(resp, expectedStatus)

      assert.equal(resp.body.username, expectedUser,
        `Username is ${resp.body.username}, but expected is ${expectedUser}`)
      yield kitManager.assertBalance(kitManager.kits[0], expectedUser,
        expectedInviteAmount)
    })

    it('Use the same invite code twice', function * () {
      const config = kitManager.kits[0]

      const expectedInviteAmount = 222
      const code = yield kitManager.createInvite(config, expectedInviteAmount)
      const data = { password: 'Passw0rd', inviteCode: code }

      // since the connector was just paid 1000 on creation,
      // have to wait a bit before paying 222 to this user
      // due to https://github.com/interledgerjs/five-bells-ledger/issues/402
      yield sleep(1000)

      // create an account and claim the code
      let resp = yield kitManager.createUser(config, Object.assign({
        username: 'rick'
      }, data))
      assertStatusCode(resp, 201)

      // create a second account claiming the same code
      resp = yield kitManager.createUser(config, Object.assign({
        username: 'michonne'
      }, data))
      assertStatusCode(resp, 201)

      yield kitManager.assertBalance(config, 'rick', expectedInviteAmount)
      yield kitManager.assertBalance(config, 'michonne', 0)
    })

    it('Update a user', function * () {
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
      assertStatusCode(resp, expectedStatus)

      assert.equal(resp.body.name, expectedName, `Name is ${resp.body.username}, 
        but expected is ${expectedName}`)
      assert.equal(resp.body.email, expectedMail, `Mail is ${resp.body.username}, 
        but expected is ${expectedMail}`)
    })
  })

  describe('Payment API -', function () {
    it('request a quote', function * () {
      const config = kitManager.kits[0]
      const sourceAmount = 5.1016
      const destinationAmount = 5

      const quote = yield kitManager.quote(config, 'alice', {
        destination: 'bob@wallet2.example',
        destinationAmount: destinationAmount
      })

      assert(quote.body.sourceAmount, sourceAmount,
        `sourceAmount is ${quote.body.sourceAmount}, but expected is ${sourceAmount}`)
      assert.equal(quote.body.destinationAmount, destinationAmount,
        `destinationAmount is ${quote.body.destinationAmount}, but expected is ${destinationAmount}`)
    })

    it('Make an intraledger payment', function * () {
      const config = kitManager.kits[0]

      const quote = yield kitManager.quote(config, 'alice', {
        destination: 'bob@wallet1.example',
        destinationAmount: 1
      })

      const resp = yield request
        .put(`https://${config.API_HOSTNAME}:${config.API_PUBLIC_PORT}/api/payments/9efa70ec-08b9-11e6-b512-3e1d05defe78`)
        .auth('alice', 'alice')
        .set('Content-Type', 'application/json')
        .send({
          destination: {identifier: 'bob@wallet1.example:443'},
          quote: quote.body
        })
      assertStatusCode(resp, 200)
      yield kitManager.assertBalance(kitManager.kits[0], 'alice', '999')
      yield kitManager.assertBalance(kitManager.kits[0], 'bob', '1001')
    })

    it('Make an interledger payment (same currency)', function * () {
      const config = kitManager.kits[0]

      const quote = yield kitManager.quote(config, 'alice', {
        destination: 'bob@wallet2.example',
        destinationAmount: 5
      })

      const resp = yield request
        .put(`https://${config.API_HOSTNAME}:${config.API_PUBLIC_PORT}/api/payments/aaaa70ec-08b9-11e6-b512-3e1d05defe78`)
        .auth('alice', 'alice')
        .set('Content-Type', 'application/json')
        .send({
          destination: {identifier: 'bob@wallet2.example:443'},
          quote: quote.body
        })
      assertStatusCode(resp, 200)

      // Alice should have:
      //    1000      USD
      //  -    5      USD (sent to Bob)
      //  /   (1 - 0.01)  (connie@wallet2 spread/fee: 1%)
      //  /   (1 - 0.01)  (connie@wallet1 spread/fee: 1%)
      //  ==============
      //     994.8984 USD

      yield kitManager.assertBalance(kitManager.kits[0], 'alice', 994.8984)
      yield kitManager.assertBalance(kitManager.kits[1], 'bob', 1005)
      yield kitManager.assertBalance(kitManager.kits[0], 'connie', 1005.1016)
      yield kitManager.assertBalance(kitManager.kits[1], 'connie', 995)
    })

    it.skip('Make an interledger payment (cross-currency)', function * () {
      const config = kitManager.kits[1]
      const resp = yield request
        .put(`https://${config.API_HOSTNAME}:${config.API_PUBLIC_PORT}/api/payments/bbbb70ec-08b9-11e6-b512-3e1d05defe78`)
        .auth('alice', 'alice')
        .set('Content-Type', 'application/json')
        .send({
          destination: 'bob@wallet3.example:443',
          destinationAmount: 100,
          message: 'interledger payment test'
        })
      assertStatusCode(resp, 200)
      // TODO: configure a static exchange rate and assert that the balances match
    })
  })
})
