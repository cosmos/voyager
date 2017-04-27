'use strict'

export default ({ basecoin }) => {
  // get tendermint RPC client from basecon client
  const { rpc } = basecoin.client

  const state = {
    syncHeight: 0,
    syncTime: 0,
    syncing: true,
    numPeers: 0
  }

  const mutations = {
    setSync (state, { height, time }) {
      state.syncHeight = height
      state.syncTime = time
      state.syncing = (Date.now() - time) > 15e3
    },
    setNumPeers (state, numPeers) {
      state.numPeers = numPeers
    }
  }

  const actions = {
    startPollingNodeStatus ({ commit }) {
      setInterval(() => {
        rpc.status((err, res) => {
          if (err) return console.error(err)
          let status = res[1]
          commit('setSync', {
            height: status.latest_block_height,
            time: status.latest_block_time / 1e6
          })
        })
        rpc.netInfo((err, res) => {
          if (err) return console.error(err)
          let netInfo = res[1]
          commit('setNumPeers', netInfo.peers.length)
        })
      }, 1000)
    }
  }

  return { state, mutations, actions }
}
