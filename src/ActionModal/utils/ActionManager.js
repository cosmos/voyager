import config from "src/../config"
import { getSigner } from "./signer"
import transaction from "./transactionTypes"
import { uatoms } from "scripts/num"
import { toMicroDenom } from "src/scripts/common"
import { getMessage, getMultiMessage } from "./MessageConstructor.js"

const txFetchOptions = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}

const apiURL = config.graphqlHost
console.log(config, apiURL)

async function transactionAPIRequest(payload) {
  // console.log(config)
  const options = {
    ...txFetchOptions,
    body: JSON.stringify({payload})
  }

  return fetch(`http://localhost:4000/transaction`, options)
  .then(r => r.json())
}

export default class ActionManager {
  constructor() {
    this.context = null
    this.message = null
  }

  setContext(context = null) {
    if (!context) {
      throw Error("Context cannot be empty")
    }
    this.context = context
  }

  readyCheck() {
    if (!this.context) {
      throw Error("This modal has no context.")
    }

    if (!this.context.connected) {
      throw Error(
        `Currently not connected to a secure node. Please try again when Lunie has secured a connection.`
      )
    }

    if (!this.message) {
      throw Error(`No message to send.`)
    }
  }

  messageTypeCheck(msgType) {
    if (!msgType) {
      throw Error("No message type present.")
    }

    const isKnownType = Object.values(transaction).includes(msgType)
    if (!isKnownType) {
      throw Error(`Invalid message type: ${msgType}.`)
    }
  }

  async setMessage(type, transactionProperties) {
    if (!this.context) {
      throw Error("This modal has no context.")
    }
    this.txProps = transactionProperties

    this.messageTypeCheck(type)
    this.messageType = type
    this.message = await getMessage(type, transactionProperties, this.context)
  }

  async simulateTxAPI(context, type, txProps, memo) {
    const txPayload = {
      simulate: true,
      networkId: context.networkId,
      address: context.userAddress,
      txProperties: txProps,
      memo
    }
    console.log(`Sending TX ${JSON.stringify(txPayload, null, 2)}`)
    const result = await transactionAPIRequest(txPayload)
    console.log(`TxAPI Response: ${JSON.stringify(result, null, 2)}`)
    return result
  }

  async simulate(memo) {
    this.readyCheck()
    const gasEstimate = await this.message.simulate({
      memo: memo
    })
    return gasEstimate
  }

  async send(memo, txMetaData) {
    this.readyCheck()

    const { gasEstimate, gasPrice, submitType, password } = txMetaData
    const signer = await getSigner(config, submitType, {
      address: this.context.userAddress,
      password
    })

    if (this.messageType === transaction.WITHDRAW) {
      this.message = await this.createWithdrawTransaction()
    }

    const messageMetadata = {
      gas: String(gasEstimate),
      gasPrices: convertCurrencyData([gasPrice]),
      memo
    }

    const { included, hash } = await this.message.send(messageMetadata, signer)

    return { included, hash }
  }

  async createWithdrawTransaction() {
    const addresses = getTop5RewardsValidators(
      this.context.bondDenom,
      this.context.rewards
    )
    return await this.createMultiMessage(transaction.WITHDRAW, {
      validatorAddresses: addresses
    })
  }

  // Withdrawing is a multi message for all validators you have bonds with
  async createMultiMessage(messageType, { validatorAddresses }) {
    const messages = Promise.all(
      validatorAddresses.map(validatorAddress =>
        getMessage(
          messageType,
          {
            validatorAddress
          },
          this.context
        )
      )
    )
    return await getMultiMessage(this.context, messages)
  }
}

function convertCurrencyData(amounts) {
  return amounts.map(({ amount, denom }) => ({
    amount: toMicroAtomString(amount),
    denom: toMicroDenom(denom)
  }))
}

function toMicroAtomString(amount) {
  return String(uatoms(amount))
}

// // limitation of the block, so we pick the top 5 rewards and inform the user.
function getTop5RewardsValidators(bondDenom, rewards) {
  // Compares the amount in a [address1, {denom: amount}] array
  const byBalance = (a, b) => b.amount - a.amount
  const validatorList = rewards
    .sort(byBalance)
    .slice(0, 5) // Just the top 5
    .map(({ validator }) => validator.operatorAddress)

  return validatorList
}
