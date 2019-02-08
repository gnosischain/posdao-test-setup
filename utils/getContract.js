"use strict";
const constants = require("./constants");

module.exports = function (contractName, web3) {
  if (contractName === "ValidatorSetAuRa") {
    const abi = require("../posdao-contracts/build/contracts/ValidatorSetAuRa").abi;
    return {
      address: constants.VALIDATOR_SET_ADDRESS,
      abi: abi,
      instance: new web3.eth.Contract(abi, constants.VALIDATOR_SET_ADDRESS),
    };
  }
  else {
    throw new Error("Unknown contract " + contractName);
  }
}
