'use strict'

const path = require('path')
const deps = path.resolve(process.cwd(), 'node_modules/')
const pluginMiniAccounts = path.resolve(deps, 'ilp-plugin-mini-accounts')
const pluginBTP = path.resolve(deps, 'ilp-plugin-btp')

// If an error gets thrown before any describe()s, mocha will silently ignore
// it, which is very difficult to debug.
process.on('uncaughtException', (err) => {
  console.error(err.stack)
  process.exit(1)
})

module.exports = ({ services }) => {
  const senders = []
  const receivers = []

  const startConnector = async (options) => {
    Object.keys(options.accounts).forEach((accountId) => {
      const account = options.accounts[accountId]
      options.accounts[accountId] = Object.assign({
        relation: 'peer',
        assetCode: 'USD',
        assetScale: 9,
        plugin: (account.options.listener || account.options.server) ? pluginBTP : pluginMiniAccounts
      }, account)
    })
    await services.startConnector(options._name || options.ilpAddress, options)
  }

  const startSender = async (options) => {
    const sender = await services.startSender(options)
    senders.push(sender)
    return sender
  }

  const startReceiver = async (options) => {
    const receiver = await services.startReceiver(options)
    receivers.push(receiver)
    return receiver
  }

  const stopPlugins = async () => {
    await Promise.all(senders.map((sender) => sender.disconnect()))
    await Promise.all(receivers.map((receiver) => receiver.disconnect()))
  }

  return {
    startConnector,
    startSender,
    startReceiver,
    stopPlugins
  }
}
