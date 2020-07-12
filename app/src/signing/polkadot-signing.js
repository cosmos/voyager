import { hexToU8a } from "@polkadot/util"
import { accountTypesDictionary } from "../../../common/dictionaries"

export async function getSignature(
  { payload, transaction },
  wallet,
  network,
  accountType
) {
  const [{ Keyring }] = await Promise.all([
    import("@polkadot/api"),
    import("@polkadot/wasm-crypto").then(async ({ waitReady }) => {
      await waitReady()
    }),
    import("@polkadot/util-crypto").then(async ({ cryptoWaitReady }) => {
      // Wait for the promise to resolve, async WASM or `cryptoWaitReady().then(() => { ... })`
      await cryptoWaitReady()
    }),
  ])

  const keyring = new Keyring({
    ss58Format: Number(network.address_prefix),
    type: accountTypesDictionary[accountType],
  })
  const keypair = keyring.createFromUri(wallet.seedPhrase)

  const rawSignature = keypair.sign(hexToU8a(payload.toRaw().data))

  return { payload, transaction, rawSignature }
}
