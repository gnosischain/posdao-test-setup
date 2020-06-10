# OpenEthereum proof-of-stake test setup

This is an integration test of AuRa POSDAO with seven OpenEthereum nodes running locally from the genesis block.

To test a migration from POA to POSDAO, please use another branch: [`migrate-poa-to-posdao`](https://github.com/poanetwork/posdao-test-setup/tree/migrate-poa-to-posdao#readme).


## Requirements

To integrate with [OpenEthereum](https://github.com/openethereum/openethereum), the following structure of folders is assumed:
```
.
├── openethereum
├── posdao-test-setup
```
So there should be two folders on the same level and `posdao-test-setup` will use a binary from the `openethereum` folder, namely the binary is assumed to be at `../openethereum/target/release/openethereum` relative to `posdao-test-setup` root.

If you want to compile a specific branch/version of `OpenEthereum`, you can clone it directly and build the binary
```bash
# move up from posdao-test-setup root
$ cd ..
$ git clone https://github.com/openethereum/openethereum
$ cd openethereum
#
# Next step assumes you have Rust and required dependencies installed,
# for details please check https://github.com/openethereum/openethereum#readme
# Note that you can instruct Rust to always use the latest stable version for this project by running
#     $ rustup override set stable
# in `openethereum` folder.
#
# Build the binary
$ cargo build --release --features final
```

To save time, you can download a pre-compiled binary from the [releases page](https://github.com/openethereum/openethereum/releases) (>= v3.0.0 is supported). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
$ cd ..
$ mkdir -p openethereum/target/release/
# an example for macOS binary
$ curl -SfL 'https://github.com/openethereum/openethereum/releases/download/v3.0.0/openethereum-macos-v3.0.0.zip' -o openethereum/target/release/openethereum.zip
$ unzip openethereum/target/release/openethereum.zip -d openethereum/target/release
$ chmod +x openethereum/target/release/openethereum
# check that it works and version is correct (compare the version from the binary with version on the release page)
$ openethereum/target/release/openethereum --version
```


## Usage

After `OpenEthereum` client is downloaded or built (see above), the integration test can be launched with `npm run all` (in the root of `posdao-test-setup` working directory).

To stop the tests, use `npm run stop-test-setup` (or just use `CTRL+C` in the console while `npm run all` working).

To stop and clear directories, use `npm run cleanup` in a separate console.

To restart the tests from scratch just run `npm run all` again.

To watch on blocks and transactions, use `npm run watcher` in a separate console.


## Development

### Adding new validator nodes and their keys

To add a new validator node, OpenEthereum should generate an account together with its
secret key like so:

```
$ ./openethereum/target/release/openethereum account new --config config/nodeX.toml --keys-path ./posdao-test-setup/data/nodeX/keys
```

given a node configuration file `config/nodeX.toml` and a newly created
directory `data/nodeX/keys`. `config/nodeX.toml` should then be amended
with the validator address output by the above command. Also, the keys directory
`data/nodeX/keys` should be committed to the Git repository: it is a part
of persistent OpenEthereum state which should be kept across state resets which happen
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
