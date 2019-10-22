'use strict';
const specParams = require("../posdao-contracts/spec").engine.authorityRound.params;
const BLOCK_REWARD_ADDRESS = specParams.blockRewardContractAddress;
const VALIDATOR_SET_ADDRESS = specParams.validators.multi[0].contract;
const RANDOM_AURA_ADDRESS = specParams.randomnessContractAddress;
const STAKING_CONTRACT_ADDRESS = "0x1100000000000000000000000000000000000001";

module.exports = {
  OWNER: "0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24",
  CANDIDATES: [
    { mining: "0xf67cc5231c5858ad6cc87b105217426e17b824bb", staking: "0xb916e7e1f4bcb13549602ed042d36746fd0d96c9" },
    { mining: "0xbe69eb0968226a1808975e1a1f2127667f2bffb3", staking: "0xdb9cb2478d917719c53862008672166808258577" },
    { mining: "0x720e118ab1006cc97ed2ef6b4b49ac04bb3aa6d9", staking: "0xb6695f5c2e3f5eff8036b5f5f3a9d83a5310e51e" }
  ],
  BLOCK_REWARD_ADDRESS,
  VALIDATOR_SET_ADDRESS,
  STAKING_CONTRACT_ADDRESS,
  RANDOM_AURA_ADDRESS,
  CANDIDATE_INITIAL_BALANCE: '100000000000000000000', // 100 "ETH"
};
