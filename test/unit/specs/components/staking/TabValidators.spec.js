import { shallowMount } from "@vue/test-utils"
import TabValidators from "renderer/components/staking/TabValidators"
import lcdClientMock from "renderer/connectors/lcdClientMock.js"

const { candidates } = lcdClientMock.state

describe(`TabValidators`, () => {
  let wrapper, $store

  const getters = {
    delegates: {
      delegates: candidates,
      loading: false,
      loaded: true
    },
    connected: true
  }

  beforeEach(async () => {
    $store = {
      getters
    }

    wrapper = shallowMount(TabValidators, {
      mocks: {
        $store
      }
    })
  })

  it(`has the expected html structure`, async () => {
    expect(wrapper.vm.$el).toMatchSnapshot()
  })

  it(`shows a message if still connecting`, async () => {
    $store = {
      getters: {
        delegates: {
          delegates: candidates,
          loading: false,
          loaded: false
        },
        connected: false
      }
    }

    wrapper = shallowMount(TabValidators, {
      mocks: {
        $store
      }
    })

    expect(wrapper.vm.$el).toMatchSnapshot()
  })

  it(`shows a message if still loading`, async () => {
    $store = {
      getters: {
        delegates: {
          delegates: candidates,
          loading: true,
          loaded: false
        },
        connected: true
      }
    }

    wrapper = shallowMount(TabValidators, {
      mocks: {
        $store
      }
    })
  })

  it(`shows a message if there is nothing to display`, async () => {
    $store = {
      getters: {
        delegates: {
          delegates: [],
          loading: false,
          loaded: true
        },
        connected: true
      }
    }

    wrapper = shallowMount(TabValidators, {
      mocks: {
        $store
      }
    })

    expect(wrapper.vm.$el).toMatchSnapshot()
  })
})
