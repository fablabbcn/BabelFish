var utilModule = require("./util"),
    arraify = utilModule.arraify,
    deepCopy = utilModule.deepCopy;

// An FSM
function Transaction () {
  this.hooks_ = {};
  this.state = null;
  this.transitions = [];
  this.context = {};
}
Transaction.prototype = {
  getHook: function (hookIdArray) {
    var key = hookIdArray.sort().join('_');
    return this.hooks_[key];
  },

  triggerHook: function (hookIdArray, varArgs) {
    var key = hookIdArray.sort().join('_'), args = arraify(arguments, 1);
    if (this.hooks_.hasOwnProperty(key))
      this.hooks_[key].forEach(function (fn) { fn.apply(null, args); });
  },

  // Will trigger 'leave' and 'enter' hooks and possibly call a
  // callback when done.
  transition: function(state, varArgs) {
    var oldState = this.state, args = arraify(arguments, 1);

    // this.triggerHook(['leave', oldState], this.context);
    this.state = state;
    // this.triggerHook(['enter', this.state], this.context);
    // this.transitions.push([state, oldState, deepCopy(this.context)]);

    console.log("Jumping to state\'", state, "' arguments:", args);
    this[state].apply(this, args);
  },

  transitionCb: function (state) {
    return this.transition.bind(this, state);
  }
};

module.exports.Transaction = Transaction;
