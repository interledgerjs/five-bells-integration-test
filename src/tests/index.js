/*global describe, it, beforeEach, before*/
'use strict'
const assert = require('assert')
const Promise = require('bluebird')
const ServiceManager = require('../lib/service-manager')

const notarySecretKey = 'ZVx0mSsB4+pNdP2q0qq2wEyHKBtoiw2co05Db0sD2Ao6a6skoSHJHAhS5uCKkR8bCu/t3IqKI0jsd3tfbndMcQ=='
const notaryPublicKey = 'OmurJKEhyRwIUubgipEfGwrv7dyKiiNI7Hd7X253THE='

const services = new ServiceManager(process.cwd())

before(function * () {
  yield services.startLedger('ledger1', 3001)
  yield services.startLedger('ledger2', 3002)
  yield services.startLedger('ledger3', 3003)

  yield services.startConnector('mark', 4001, {
    pairs: [
      ['USD@http://localhost:3001', 'USD@http://localhost:3002'],
      ['USD@http://localhost:3002', 'USD@http://localhost:3001']
    ],
    credentials: {
      'http://localhost:3001': makeCredentials('http://localhost:3001', 'mark'),
      'http://localhost:3002': makeCredentials('http://localhost:3002', 'mark')
    }
  })

  yield services.startConnector('mary', 4002, {
    pairs: [
      ['USD@http://localhost:3003', 'USD@http://localhost:3002'],
      ['USD@http://localhost:3002', 'USD@http://localhost:3003']
    ],
    credentials: {
      'http://localhost:3002': makeCredentials('http://localhost:3002', 'mary'),
      'http://localhost:3003': makeCredentials('http://localhost:3003', 'mary')
    }
  })

  yield services.startNotary('notary1', 6001, {
    secretKey: notarySecretKey,
    publicKey: notaryPublicKey
  })
})

// Run this before each test
beforeEach(function * () {
  // Users
  yield services.updateAccount('http://localhost:3001', 'alice', {balance: '100'})
  yield services.updateAccount('http://localhost:3002', 'bob', {balance: '100'})
  yield services.updateAccount('http://localhost:3003', 'carl', {balance: '100'})
  // Connectors
  yield services.updateAccount('http://localhost:3001', 'mark', {balance: '1000'})
  yield services.updateAccount('http://localhost:3002', 'mark', {balance: '1000'})
  yield services.updateAccount('http://localhost:3002', 'mary', {balance: '1000'})
  yield services.updateAccount('http://localhost:3003', 'mary', {balance: '1000'})
})

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
    yield assertBalance('http://localhost:3001', 'alice', '100')
    yield assertBalance('http://localhost:3002', 'bob', '100')
    // Connectors
    yield assertBalance('http://localhost:3001', 'hold', '0')
    yield assertBalance('http://localhost:3002', 'hold', '0')
    yield assertBalance('http://localhost:3003', 'hold', '0')
    yield assertBalance('http://localhost:3001', 'mark', '1000')
    yield assertBalance('http://localhost:3002', 'mark', '1000')
    yield assertBalance('http://localhost:3002', 'mary', '1000')
    yield assertBalance('http://localhost:3003', 'mary', '1000')
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
    yield services.sendPayment({
      sourceAccount: 'http://localhost:3001/accounts/alice',
      sourcePassword: 'alice',
      destinationAccount: 'http://localhost:3002/accounts/bob',
      destinationAmount: '5'
    })
    yield Promise.delay(2000)
    // Alice should have:
    //    100      USD
    //  -   5      USD (sent to Bob)
    //  -   0.01   USD (connector spread/fee)
    //  -   0.0001 USD (connector rounding in its favor)
    //  ==============
    //     94.9899 USD
    yield assertBalance('http://localhost:3001', 'alice', '94.9899')
    yield assertBalance('http://localhost:3001', 'mark', '1005.0101')

    // Bob should have:
    //    100      USD
    //  +   5      USD (money from Alice)
    //  ==============
    //    105      USD
    yield assertBalance('http://localhost:3002', 'bob', '105')
    yield assertBalance('http://localhost:3002', 'mark', '995')
    yield assertZeroHold()
  })

  it('transfers the funds (by source amount', function * () {
    yield services.sendPayment({
      sourceAccount: 'http://localhost:3001/accounts/alice',
      sourcePassword: 'alice',
      destinationAccount: 'http://localhost:3002/accounts/bob',
      sourceAmount: '5'
    })
    yield Promise.delay(2000)
    // Alice should have:
    //    100      USD
    //  -   5      USD (sent to Bob)
    //  ==============
    //     95      USD
    yield assertBalance('http://localhost:3001', 'alice', '95')
    yield assertBalance('http://localhost:3001', 'mark', '1005')

    // Bob should have:
    //    100      USD
    //  +   5      USD (money from Alice)
    //  -   0.01   USD (connector spread/fee)
    //  ==============
    //    104.99   USD
    yield assertBalance('http://localhost:3002', 'bob', '104.99')
    yield assertBalance('http://localhost:3002', 'mark', '995.01')
    yield assertZeroHold()
  })

  it('fails when there are insufficient source funds', function * () {
    let err
    try {
      yield services.sendPayment({
        sourceAccount: 'http://localhost:3001/accounts/alice',
        sourcePassword: 'alice',
        destinationAccount: 'http://localhost:3002/accounts/bob',
        destinationAmount: '500'
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
    yield assertBalance('http://localhost:3001', 'alice', '100')
    yield assertBalance('http://localhost:3001', 'mark', '1000')
    yield assertBalance('http://localhost:3002', 'bob', '100')
    yield assertBalance('http://localhost:3002', 'mark', '1000')
    yield assertZeroHold()
  })

  it('transfers a payment with 3 steps', function * () {
    yield services.sendPayment({
      sourceAccount: 'http://localhost:3001/accounts/alice',
      sourcePassword: 'alice',
      destinationAccount: 'http://localhost:3003/accounts/carl',
      destinationAmount: '5'
    })
    yield Promise.delay(2000)

    // Alice should have:
    //    100      USD
    //  -   5      USD (sent to Carl)
    //  -   0.01   USD (mary: connector spread/fee)
    //  -   0.0001 USD (mary: connector rounding in its favor)
    //  -   0.01   USD (mark: connector spread/fee)
    //  -   0.0001 USD (mark: connector rounding in its favor)
    //  ==============
    //     94.9899 USD
    yield assertBalance('http://localhost:3001', 'alice', '94.9798')
    yield assertBalance('http://localhost:3001', 'mark', '1005.0202')

    yield assertBalance('http://localhost:3002', 'mark', '994.9899')
    yield assertBalance('http://localhost:3002', 'mary', '1005.0101')

    // Carl should have:
    //    100      USD
    //  +   5      USD (money from Alice)
    //  ==============
    //    105      USD
    yield assertBalance('http://localhost:3003', 'carl', '105')
    yield assertBalance('http://localhost:3003', 'mary', '995')
    yield assertZeroHold()
  })
})

describe('send atomic payment', function () {
  it('transfers the funds', function * () {
    yield services.sendPayment({
      sourceAccount: 'http://localhost:3001/accounts/alice',
      sourcePassword: 'alice',
      destinationAccount: 'http://localhost:3002/accounts/bob',
      destinationAmount: '5',
      notary: 'http://localhost:6001',
      notaryPublicKey
    })
    yield Promise.delay(2000)
    // Alice should have:
    //    100      USD
    //  -   5      USD (sent to Bob)
    //  -   0.01   USD (connector spread/fee)
    //  -   0.0001 USD (connector rounding in its favor)
    //  ==============
    //     94.9899 USD
    yield assertBalance('http://localhost:3001', 'alice', '94.9899')
    yield assertBalance('http://localhost:3001', 'mark', '1005.0101')

    // Bob should have:
    //    100      USD
    //  +   5      USD (money from Alice)
    //  ==============
    //    105      USD
    yield assertBalance('http://localhost:3002', 'bob', '105')
    yield assertBalance('http://localhost:3002', 'mark', '995')
    yield assertZeroHold()
  })
})

function * assertBalance (ledger, name, expectedBalance) {
  const actualBalance = yield services.getBalance(ledger, name)
  assert.equal(actualBalance, expectedBalance,
    `Ledger balance for ${name} should be ${expectedBalance}, but is ${actualBalance}`)
}

function * assertZeroHold () {
  yield assertBalance('http://localhost:3001', 'hold', '0')
  yield assertBalance('http://localhost:3002', 'hold', '0')
  yield assertBalance('http://localhost:3003', 'hold', '0')
}

function makeCredentials (ledger, name) {
  return {
    account_uri: ledger + '/accounts/' + encodeURIComponent(name),
    username: name,
    password: name
  }
}
