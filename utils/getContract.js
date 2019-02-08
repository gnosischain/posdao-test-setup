"use strict";
const constants = require("./constants");

module.exports = function (contractName, web3) {
  if (contractName === "ValidatorSetBase") {
    const VALIDATOR_SET_BASE_ABI = require("../posdao-contracts/build/contracts/ValidatorSetBase").abi;
    return {
      address: constants.VALIDATOR_SET_ADDRESS,
      abi: VALIDATOR_SET_BASE_ABI,
      instance: new web3.eth.Contract(VALIDATOR_SET_BASE_ABI, constants.VALIDATOR_SET_ADDRESS),
    };
  }
  else {
    throw new Error("Unknown contract " + contractName);
  }
}
