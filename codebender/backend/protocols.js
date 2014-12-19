var Stk500 = require('./protocols/stk500').STK500Transaction;
var Avr109 = require('./protocols/butterfly').AVR109Transaction;

module.exports.protocols = {
  arduino: Stk500,
  stk500: Stk500,
  avr109: Avr109
};
