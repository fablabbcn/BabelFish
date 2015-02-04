var Stk500 = require('./protocols/stk500').STK500Transaction;
var Stk500v2 = require('./protocols/stk500v2').STK500v2Transaction;
var Avr109 = require('./protocols/butterfly').AVR109Transaction;
var USBTiny = require('./protocols/usbtiny').USBTinyTransaction;

module.exports.protocols = {
  stk500v2: Stk500v2,
  wiring: Stk500v2,
  arduino: Stk500,
  stk500: Stk500,
  avr109: Avr109,
  usbtiny: USBTiny
};
