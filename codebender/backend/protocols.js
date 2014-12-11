module.exports.protocols = {
  stk: require('./protocols/stk500').STK500Transaction,
  avr109: require('./protocols/butterfly').AVR109Transaction
};
