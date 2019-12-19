import { shallowMount, createLocalVue } from "@vue/test-utils"
import ModalTutorial from "common/ModalTutorial"
import { focusParentLast } from "src/directives"

let localVue = createLocalVue()
localVue.directive("focus-last", focusParentLast)

global.window = Object.create(window)
window.open = jest.fn()

describe(`TmModal`, () => {
  let wrapper
  let mockCloseFn

  beforeEach(() => {
    mockCloseFn = jest.fn()
    wrapper = shallowMount(ModalTutorial, {
      localVue,
      propsData: {
        close: mockCloseFn,
        show: true
      }
    })
  })

  it(`has the expected html structure`, () => {
    expect(wrapper.element).toMatchSnapshot()
  })

  it(`should go next step`, () => {
    wrapper.vm.nextLink()
    expect(wrapper.vm.currentStep).toBe(2)
  })

  it(`should go prev step`, () => {
    wrapper.vm.currentStep = 2
    wrapper.vm.prevLink()
    expect(wrapper.vm.currentStep).toBe(1)
  })

  it(`should go to target URL in the last step`, () => {
    wrapper.vm.currentStep = 4
    wrapper.vm.nextLink()
    expect(window.open).toBeCalled()
  })

  it(`should close with escape key`, () => {
    wrapper.trigger("keyup.esc")
    expect(mockCloseFn).toBeCalled()
  })
})
