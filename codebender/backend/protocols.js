module.exports.protocols = {
  stk500: require('./protocols/stk500').STK500Transaction,
  avr109: require('./protocols/butterfly').AVR109Transaction
};
