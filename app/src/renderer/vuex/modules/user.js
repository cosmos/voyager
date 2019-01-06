import * as Sentry from "@sentry/browser"
import addGoogleAnalytics from "../../google-analytics.js"
const config = require(`../../../config.json`)
import {
  loadKeyNames,
  importKey,
  testPassword
} from "../../../helpers/keystore.js"
import { generateSeed } from "../../../helpers/wallet.js"
import CryptoJS from "crypto-js"

export default ({ node }) => {
  const ERROR_COLLECTION_KEY = `voyager_error_collection`

  let state = {
    atoms: 0,
    signedIn: false,
    accounts: [],
    pauseHistory: false,
    history: [],
    account: null,
    address: null,
    errorCollection: false,
    stateLoaded: false, // shows if the persisted state is already loaded. used to prevent overwriting the persisted state before it is loaded
    error: null
  }

  const mutations = {
    setAccounts(state, accounts) {
      state.accounts = accounts
    },
    setAtoms(state, atoms) {
      state.atoms = atoms
    },
    addHistory(state, path) {
      state.history.push(path)
      window.analytics &&
        window.analytics.send(`pageview`, {
          dl: path
        })
    },
    popHistory(state) {
      state.history.pop()
    },
    pauseHistory(state, paused) {
      state.pauseHistory = paused
    }
  }

  const actions = {
    async reconnected({ dispatch }) {
      // reload available accounts as the reconnect could be a result of a switch from a mocked connection with mocked accounts
      await dispatch(`loadAccounts`)
    },
    async showInitialScreen({ dispatch, commit }) {
      dispatch(`resetSessionData`)

      await dispatch(`loadAccounts`)
      let exists = state.accounts.length > 0
      let screen = exists ? `sign-in` : `welcome`
      commit(`setModalSessionState`, screen)

      window.analytics &&
        window.analytics.send(`pageview`, {
          dl: `/session/` + screen
        })
    },
    async loadAccounts({ commit, state }) {
      state.loading = true
      try {
        let keys = await loadKeyNames()
        commit(`setAccounts`, keys)
      } catch (error) {
        Sentry.captureException(error)
        commit(`notifyError`, {
          title: `Couldn't read keys`,
          body: error.message
        })
        state.error = error
      } finally {
        state.loading = false
      }
    },
    async testLogin(state, { password, account }) {
      return await testPassword(account, password)
    },
    createSeed() {
      return generateSeed(x => CryptoJS.lib.WordArray.random(x).toString())
    },
    async createKey({ dispatch }, { seedPhrase, password, name }) {
      let { address } = await importKey(name, password, seedPhrase)
      dispatch(`initializeWallet`, address)
      return address
    },
    async deleteKey(ignore, { password, name }) {
      await node.keys.delete(name, { name, password })
      return true
    },
    async signIn({ state, commit, dispatch }, { account }) {
      state.account = account
      state.signedIn = true

      let keys = await loadKeyNames()
      let { address } = keys.find(({ name }) => name === account)

      state.address = address

      dispatch(`loadPersistedState`)
      commit(`setModalSession`, false)
      dispatch(`initializeWallet`, address)
      dispatch(`loadErrorCollection`, account)
    },
    signOut({ state, commit, dispatch }) {
      state.account = null
      state.signedIn = false

      dispatch(`removeSubscriptions`)
      commit(`setModalSession`, true)
      dispatch(`showInitialScreen`)
    },
    resetSessionData({ state }) {
      state.atoms = 0
      state.history = []
      state.account = null
      state.address = null
    },
    loadErrorCollection({ state, dispatch }, account) {
      let errorCollection =
        localStorage.getItem(`${ERROR_COLLECTION_KEY}_${account}`) === `true`
      if (state.errorCollection !== errorCollection)
        dispatch(`setErrorCollection`, { account, optin: errorCollection })
    },
    setErrorCollection({ state, commit }, { account, optin }) {
      if (state.errorCollection !== optin && config.development) {
        commit(`notifyError`, {
          title: `Couldn't switch ${optin ? `on` : `off`} error collection.`,
          body: `Error collection is disabled during development.`
        })
      }
      state.errorCollection = config.development ? false : optin
      localStorage.setItem(
        `${ERROR_COLLECTION_KEY}_${account}`,
        state.errorCollection
      )

      if (state.errorCollection) {
        Sentry.init({
          dsn: config.sentry_dsn,
          release: `voyager@${config.version}`
        })
        window[`ga-disable-${config.google_analytics_uid}`] = false
        addGoogleAnalytics(config.google_analytics_uid)
        console.log(`Analytics and error reporting have been enabled`)
        // eslint-disable-next-line no-undef
        ga(`send`, `pageview`, {
          dl: window.location.pathname
        })
      } else {
        console.log(`Analytics disabled in browser`)
        Sentry.init({})
        window[`ga-disable-${config.google_analytics_uid}`] = true
      }
    }
  }

  return {
    state,
    mutations,
    actions
  }
}
