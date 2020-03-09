# Open Ethereum proof-of-stake test setup

This is an integration test of AuRa POSDAO with seven Open Ethereum nodes running locally from the genesis block.

To test a migration from POA to POSDAO, please use another branch: [`migrate-poa-to-posdao`](https://github.com/poanetwork/posdao-test-setup/tree/migrate-poa-to-posdao#readme).


## Requirements

To integrate with [Open Ethereum](https://github.com/OpenEthereum/open-ethereum), the following structure of folders is assumed:
```
.
├── open-ethereum
├── posdao-test-setup
```
So there should be two folders on the same level and `posdao-test-setup` will use a binary from the `open-ethereum` folder, namely the binary is assumed to be at `../open-ethereum/target/release/parity` relative to `posdao-test-setup` root.

If you want to compile a specific branch/version of `Open Ethereum`, you can clone it directly and build the binary
```bash
# move up from posdao-test-setup root
$ cd ..
$ git clone https://github.com/OpenEthereum/open-ethereum
$ cd open-ethereum
#
# Next step assumes you have Rust and required dependencies installed,
# for details please check https://github.com/OpenEthereum/open-ethereum/blob/master/README.md
# Note that you can instruct Rust to always use the latest stable version for this project by running
#     $ rustup override set stable
# in `open-ethereum` folder.
#
# Build the binary
$ cargo build --release --features final
```

To save time, you can download a pre-compiled binary from the [releases page](https://github.com/OpenEthereum/open-ethereum/releases). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
$ cd ..
$ mkdir -p open-ethereum/target/release/
# an example for macOS binary
$ curl -SfL 'https://releases.parity.io/ethereum/stable/x86_64-apple-darwin/parity' -o open-ethereum/target/release/parity
$ chmod +x open-ethereum/target/release/parity
# check that it works and version is correct (compare the version from the binary with version on the release page)
$ open-ethereum/target/release/parity --version
```


## Usage

After `Open Ethereum` client is downloaded or built (see above), the integration test can be launched with `npm run all` (in the root of `posdao-test-setup` working directory).

To stop the tests, use `npm run stop-test-setup` (or just use `CTRL+C` in the console while `npm run all` working).

To stop and clear directories, use `npm run cleanup` in a separate console.

To restart the tests from scratch just run `npm run all` again.

To watch on blocks and transactions, use `npm run watcher` in a separate console.


## Development

### Adding new validator nodes and their keys

To add a new validator node, Open Ethereum should generate an account together with its
secret key like so:

```
$ parity account new --config config/nodeX.toml --keys-path parity-data/nodeX/keys
```

given a node configuration file `config/nodeX.toml` and a newly created
directory `parity-data/nodeX/keys`. `config/nodeX.toml` should then be amended
with the validator address output by the above command. Also, the keys directory
`parity-data/nodeX/keys` should be committed to the Git repository: it is a part
of persistent Open Ethereum state which should be kept across state resets which happen
when you run `npm run all`.

With this done, the node can be added to the list of started nodes in
`scripts/start-test-setup` and to the list of stopped nodes in
`scripts/stop-test-setup`.

If the new node has to be an initial validator, the network spec should reflect
that: add the node's address to `INITIAL_VALIDATORS` and `STAKING_ADDRESSES` in `scripts/network-spec`.

## Simulation

We've created a [NetLogo model](./simulation/README.md) for simulating the
staking and rewards computation on networks of various sizes and having
different input parameters.
