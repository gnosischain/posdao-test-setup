# Parity proof-of-stake test setup

This is an integration test of AuRa POSDAO with seven Parity nodes running locally.


## Usage

To configure the repository and run tests, execute `npm run all`.


## Requirements

To integrate with [parity-ethereum](https://github.com/paritytech/parity-ethereum), the following structure of folders is assumed:
```
.
├── parity-ethereum
├── posdao-test-setup
```
So there should be two folders on the same level and `posdao-test-setup` will use parity binary from the `parity-ethereum` folder, namely the binary is assumed to be at `../parity-ethereum/target/release/parity` relative to `posdao-test-setup` root.

If you are working on modifications of `parity-ethereum` or want to compile specific branch/version, you can clone it directly and build the binary
```bash
# move up from posdao-test-setup root
cd ..
git clone https://github.com/paritytech/parity-ethereum
cd parity-ethereum
#
# Next step assumes you have Rust and required dependencies installed,
# for details please check https://github.com/paritytech/parity-ethereum/blob/master/README.md
# Note that you can instruct Rust to always use the latest stable version for this project by running
#     $ rustup override set stable
# in `parity-ethereum` folder.
#
# Build the binary
cargo build --release --features final
```

To save time, you can download a pre-compiled binary from the [releases page](https://github.com/paritytech/parity-ethereum/releases). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
cd ..
mkdir -p parity-ethereum/target/release/
curl -SfL 'https://releases.parity.io/ethereum/stable/x86_64-apple-darwin/parity' -o parity-ethereum/target/release/parity
chmod +x parity-ethereum/target/release/parity
# check that it works and version is correct (compare the version from the binary with version on the release page)
parity-ethereum/target/release/parity --version
```

This setup is backward compatible with our [old v2.5.9 fork](https://github.com/poanetwork/parity-ethereum/tree/aura-pos).


## Development

### Adding new validator nodes and their keys

To add a new validator node, Parity should generate an account together with its
secret key like so:

```
parity account new --config config/nodeX.toml --keys-path parity-data/nodeX/keys
```

given a node configuration file `config/nodeX.toml` and a newly created
directory `parity-data/nodeX/keys`. `config/nodeX.toml` should then be amended
with the validator address output by the above command. Also, the keys directory
`parity-data/nodeX/keys` should be committed to the Git repository: it is a part
of persistent Parity state which should be kept across state resets which happen
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
