import { shallowMount } from "@vue/test-utils"
import StakeTxDetails from "src/components/transactions/message-view/StakeTxDetails"

describe(`StakeTxDetails`, () => {
  let wrapper

  const tx = {
    type: "StakeTx",
    hash: "3CA728671B8078E71697B62237AD694052779F80B56880F6A6F1702F53EA3081",
    height: 308453,
    timestamp: "2020-01-10T09:02:54Z",
    memo: "",
    success: true,
    fees: [
      {
        denom: "ATOM",
        amount: "0.00045",
      },
    ],
    details: {
      to: ["cosmosvaloper18ymm350peujvq2xy9ymyqj4v34ekvnk3tsekuz"],
      amount: {
        denom: "ATOM",
        amount: "10",
      },
    },
  }

  it(`renders a stake transaction message`, () => {
    wrapper = shallowMount(StakeTxDetails, {
      propsData: {
        transaction: tx,
        validators: {},
      },
      formatAddress,
      stubs: [`router-link`],
    })
    expect(wrapper.element).toMatchSnapshot()
  })
})
