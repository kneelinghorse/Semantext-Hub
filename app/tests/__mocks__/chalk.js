// Mock implementation of chalk for testing
const identity = (str) => str;

const chalk = {
  red: identity,
  green: identity,
  yellow: identity,
  blue: identity,
  cyan: identity,
  bold: identity
};

module.exports = chalk;
module.exports.default = chalk;
