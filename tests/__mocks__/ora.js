// Mock implementation of ora for testing
module.exports = function ora(message) {
  return {
    start: () => ({
      succeed: () => {},
      fail: () => {},
      warn: () => {},
      info: () => {},
      stop: () => {},
      text: message
    }),
    succeed: () => {},
    fail: () => {},
    warn: () => {},
    info: () => {},
    stop: () => {},
    text: message
  };
};
