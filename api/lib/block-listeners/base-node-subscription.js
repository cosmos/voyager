const {
  publishBlockAdded,
  publishUserTransactionAddedV2,
  publishEvent: publishEvent
} = require('../subscriptions')
const Sentry = require('@sentry/node')
const database = require('../database')
const config = require('../../config.js')
const {
  lunieMessageTypes: { SEND }
} = require('../message-types.js')
const {
  eventTypes,
  resourceTypes
} = require('../notifications/notifications-types')
const { keyBy } = require('lodash')

const db = database(config)('')

const BLOCK_POLLING_INTERVAL = 5000
const EXPECTED_MAX_BLOCK_WINDOW = 120000
const VALIDATOR_PROFILE_POLLING_INTERVAL = 120000 // 2min
const PROPOSAL_POLLING_INTERVAL = 600000 // 10min
const UPDATE_NETWORKS_POLLING_INTERVAL = 60000 // 1min

// This class polls for new blocks
// Used for listening to events, such as new blocks.
class BaseNodeSubscription {
  constructor(network, dataSourceClass, store, fiatValuesAPI) {
    this.network = network
    this.dataSourceClass = dataSourceClass
    this.store = store
    this.validators = []
    const networkSchemaName = this.network.id.replace(/-/g, '_')
    this.db = new database(config)(networkSchemaName)
    this.chainHangup = undefined
    this.height = undefined
    this.fiatValuesAPI = fiatValuesAPI

    // we can't use async/await in a constructor
    this.setup(network, dataSourceClass, store, fiatValuesAPI).then(() => {
      this.pollForNewBlock()
      // start one minute loop to update networks from db
      this.pollForUpdateNetworks()
      // start polling for validator profiles
      this.pollForValidatorsProfiles()
    })

    this.store.dataReady.then(() => {
      if (network.feature_proposals === 'ENABLED') this.pollForProposalChanges()
    })
  }

  // overwrite with setup logic per network type
  async setup() {}

  // If you create this.cosmosAPI object in constructor, it will stay forever as it caches
  // Don't want this behaviour as this needs to be recreated with every new context
  getDataSource() {
    return new this.dataSourceClass(
      this.network,
      this.store,
      this.fiatValuesAPI,
      this.db
    )
  }

  async pollForValidatorsProfiles() {
    const dataSource = this.getDataSource()
    this.getValidatorProfiles(dataSource)

    this.validatorProfilePollingTimeout = setTimeout(async () => {
      this.pollForValidatorsProfiles()
    }, VALIDATOR_PROFILE_POLLING_INTERVAL)
  }

  async pollForProposalChanges() {
    const dataSource = this.getDataSource()

    // set store upon start
    this.store.update({
      proposals: await dataSource.getAllProposals(this.validators)
    })

    this.proposalPollingTimeout = setTimeout(async () => {
      this.pollForProposalChanges()
    }, PROPOSAL_POLLING_INTERVAL)
  }

  async pollForUpdateNetworks() {
    // gives us the control to modify network parameters
    this.store.updateNetworkFromDB()
    this.updateNetworksPollingTimeout = setTimeout(async () => {
      this.pollForUpdateNetworks()
    }, UPDATE_NETWORKS_POLLING_INTERVAL)
  }

  async checkForNewBlock(dataSource) {
    let block
    try {
      block = await dataSource.getBlockByHeightV2()
    } catch (error) {
      console.error('Failed to fetch block', error)
      Sentry.captureException(error)
      return
    }
    // overwrite chain_id with the network's one, making sure it is correct
    this.store.network.chain_id = block.chainId
    if (block && this.height !== block.height) {
      this.loadNewBlocks(block, dataSource)
    }
  }

  async loadNewBlocks(latestBlock, dataSource) {
    // get missed blocks
    while (!this.height || this.height < latestBlock.height) {
      // if we now we missed a block, load passed blocks
      const currentBlock =
        !this.height || this.height + 1 !== latestBlock.height
          ? await dataSource.getBlockByHeightV2(this.height + 1)
          : latestBlock

      this.newBlockHandler(currentBlock, dataSource)
      // if we have no last block analyzed we start analyzing from the current block
      // afterwards we load all blocks that follow that block
      // TODO we should store the last analyzed block in the db to not forget to query missed blocks
      if (!this.height) {
        this.height = Number(latestBlock.height)
      } else {
        this.height++
      }

      // we are safe, that the chain produced a block so it didn't hang up
      if (this.chainHangup) clearTimeout(this.chainHangup)
    }
  }

  async getValidators(block, dataSource) {
    dataSource.getAllValidators(block.height).then((validators) => {
      this.store.update({
        validators: validators
      })
    })
  }

  async getValidatorsProfilesFromDB(allValidatorsAddresses) {
    const allValidatorsProfiles = await this.db.getAllValidatorsProfiles(
      allValidatorsAddresses,
      this.network.id
    )
    return keyBy(allValidatorsProfiles, `operator_address`)
  }

  async getAllValidatorsFeed(
    validators,
    allValidatorsAddresses,
    networkList,
    dataSource
  ) {
    const allValidatorsFeed = await this.db.getAccountsNotifications(
      allValidatorsAddresses,
      this.network.id
    )
    return validators.map((validator) => {
      const validatorFeed = allValidatorsFeed.filter(
        ({ resourceId }) => resourceId === validator.operatorAddress
      )
      return {
        ...validator,
        feed:
          validatorFeed && Array.isArray(validatorFeed)
            ? validatorFeed.map((notification) =>
                dataSource.reducers.notificationReducer(
                  notification,
                  networkList
                )
              )
            : []
      }
    })
  }

  async getAllValidatorsProfiles(validators, dataSource) {
    const networkList = await db.getNetworks()
    validators = dataSource.getRanksForValidators(validators)
    const allValidatorsAddresses = validators.map(
      ({ operatorAddress }) => operatorAddress
    )
    validators = await this.getAllValidatorsFeed(
      validators,
      allValidatorsAddresses,
      networkList,
      dataSource
    )
    const validatorProfilesDictionary = await this.getValidatorsProfilesFromDB(
      allValidatorsAddresses
    )
    return await Promise.all(
      validators.map(async (enrichedValidator) => {
        const allValidatorDelegations = await dataSource.getAllValidatorDelegations(
          enrichedValidator
        )
        return this.reducers.validatorProfileReducer(
          enrichedValidator,
          validatorProfilesDictionary[enrichedValidator.operatorAddress],
          allValidatorDelegations.length,
          this.network,
          enrichedValidator.feed
        )
      })
    )
  }

  async getValidatorProfiles(dataSource) {
    const validators = Object.values(this.store.validators, dataSource)
    await this.getAllValidatorsProfiles(validators, dataSource).then(
      (validatorsWithProfiles) => {
        this.store.update({
          validators: validatorsWithProfiles
        })
      }
    )
  }

  async pollForNewBlock() {
    const dataSource = this.getDataSource()
    await this.checkForNewBlock(dataSource)

    this.pollingTimeout = setTimeout(async () => {
      await this.checkForNewBlock(dataSource)

      this.pollForNewBlock()
    }, BLOCK_POLLING_INTERVAL)

    // if there are no new blocks for some time, trigger an error
    // TODO: show this error automatically in the UI
    // clearing previous timeout, otherwise it will execute
    if (this.chainHangup) clearTimeout(this.chainHangup)
    this.chainHangup = setTimeout(() => {
      console.error(`Chain ${this.network.id} seems to have halted.`)
      Sentry.captureException(
        new Error(`Chain ${this.network.id} seems to have halted.`)
      )
    }, EXPECTED_MAX_BLOCK_WINDOW)
  }

  // For each block event, we fetch the block information and publish a message.
  // A GraphQL resolver is listening for these messages and sends the block to
  // each subscribed user.
  async newBlockHandler(block, dataSource) {
    try {
      Sentry.configureScope(function (scope) {
        scope.setExtra('height', block.height)
      })

      this.store.update({
        block
      })
      publishBlockAdded(this.network.id, block)

      // allow for network specific block handlers
      if (dataSource.newBlockHandler) {
        await dataSource.newBlockHandler(block, this.store)
      }

      this.getValidators(block, dataSource)

      // For each transaction listed in a block we extract the relevant addresses. This is published to the network.
      // A GraphQL resolver is listening for these messages and sends the
      // transaction to each subscribed user.
      // TODO doesn't handle failing txs as it doesn't extract addresses from those txs (they are not tagged)
      block.transactions.forEach((tx) => {
        tx.involvedAddresses.forEach((address) => {
          const involvedAddress = address
          publishUserTransactionAddedV2(this.network.id, involvedAddress, tx)

          if (tx.type === SEND) {
            const eventType =
              involvedAddress === tx.details.from[0]
                ? eventTypes.TRANSACTION_SEND
                : eventTypes.TRANSACTION_RECEIVE
            publishEvent(
              this.network.id,
              resourceTypes.TRANSACTION,
              eventType,
              involvedAddress,
              tx
            )
          }
        })
      })
    } catch (error) {
      console.error('newBlockHandler failed', error)
      Sentry.captureException(error)
    }
  }
}

module.exports = BaseNodeSubscription
