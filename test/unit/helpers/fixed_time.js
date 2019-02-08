"use strict"
const timezone_mock = require(`timezone-mock`)
timezone_mock.register(`UTC`)

const DATE_TO_USE = new Date(Date.UTC(1970, 0, 1, 0, 0, 42))
global._Date = Date
global.Date = jest.fn(() => new global._Date(DATE_TO_USE.toISOString()))
Date.now = jest.fn(() => DATE_TO_USE.getTime())
