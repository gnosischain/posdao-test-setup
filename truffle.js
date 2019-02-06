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
      from: "0xbbcaa8d48289bb1ffcf9808d9aa4b1d215054c78",
      gas: 8000000,
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
