'use strict';
const VALIDATOR_SET_ADDRESS = require("../posdao-contracts/spec").engine.authorityRound.params.validators.multi[0].contract;

module.exports = {
  OWNER: "0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24",
  CANDIDATES: ["0xf67cc5231c5858ad6cc87b105217426e17b824bb", "0xbe69eb0968226a1808975e1a1f2127667f2bffb3", "0x720e118ab1006cc97ed2ef6b4b49ac04bb3aa6d9"],
  VALIDATOR_SET_ADDRESS,
};
