module.exports = {
  rpc: {
    host: "localhost",
    port: 8541
  },
  networks: {
    development: {
      host: "localhost",
      port: 8541,
      network_id: "*",
      from: "0x32e4e4c7c5d1cea5db5f9202a9e4d99e56c91a24",
      gas: 6000000,
      gasPrice: 0,
      before_timeout: 300000,  // test timeout in ms
      test_timeout: 300000     // test timeout in ms
    }
  },
  compilers: {
    solc: {
      version: "0.5.2",    // Fetch exact version from solc-bin (default: truffle's version)
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "byzantium"
    }
  }
};
