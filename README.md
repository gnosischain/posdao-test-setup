# Open Ethereum proof-of-stake test setup

This is an integration test of AuRa POSDAO with seven `Open Ethereum` nodes running locally.

The test starts a chain with POA consensus and then migrates to POSDAO consensus. POA utilizes `Open Ethereum v2.6.8-beta`, but POSDAO requires `v2.7.2-posdao-stable` (and above). The chain switches from `v2.6.8-beta` to `v2.7.2-posdao-stable` when migrating from POA to POSDAO consensus.


## Requirements

To integrate with [Open Ethereum](https://github.com/OpenEthereum/open-ethereum), the following structure of folders is assumed:
```
.
├── open-ethereum
├── posdao-test-setup
```
So there should be two folders on the same level and `posdao-test-setup` will use a binary from the `open-ethereum` folder, namely the binary is assumed to be at `../open-ethereum/target/release/parity` relative to `posdao-test-setup` root.

If you want to compile specific branch/version, you can clone it directly and build the binary
```bash
# move up from posdao-test-setup root
$ cd ..
$ git clone -b posdao-backport https://github.com/poanetwork/open-ethereum
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

To save time, you can download a pre-compiled binary from the [releases page](https://github.com/poanetwork/open-ethereum/releases). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
$ cd ..
$ mkdir -p open-ethereum/target/release/
# an example for macOS binary
$ curl -SfL 'https://github.com/poanetwork/open-ethereum/releases/download/v2.7.2-posdao-stable/parity-macos.zip' -o open-ethereum/target/release/parity-macos.zip
$ unzip open-ethereum/target/release/parity-macos.zip -d open-ethereum/target/release
$ chmod +x open-ethereum/target/release/parity
# check that it works and version is correct (compare the version from the binary with version on the release page)
$ open-ethereum/target/release/parity --version
```

As it was noted above, this setup requires having two different Open Ethereum binaries: `v2.6.8-beta` and `v2.7.2-posdao-stable`. The directory `open-ethereum/target/release` must contain two binaries: `parity268` (v2.6.8-beta) and `parity` (v2.7.2-posdao-stable). So, after v2.7.2 is built or downloaded to `open-ethereum/target/release` (according to the above instructions), the `v2.6.8-beta` must also be downloaded to the same directory:

```bash
$ curl -SfL 'https://releases.parity.io/ethereum/v2.6.8/x86_64-apple-darwin/parity' -o open-ethereum/target/release/parity268
$ chmod +x open-ethereum/target/release/parity268
# check that it works and version is correct (must be v2.6.8-beta)
$ open-ethereum/target/release/parity268 --version
```


## Usage

After `Open Ethereum` client is downloaded or built (see above), the integration test can be launched with `npm run all` (in the root of `posdao-test-setup` working directory).

To stop the tests, use `npm run stop-test-setup` (or just use `CTRL+C` in the console while `npm run all` working).

To stop and clear directories, use `npm run cleanup` in a separate console.

To restart the tests from scratch just run `npm run all` again.

To watch on blocks and transactions, use `npm run watcher` in a separate console.

The full tests may take about 30 minutes.


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
`scripts/start-poa` and to the list of stopped nodes in
`scripts/stop-test-setup`.

If the new node has to be an initial validator, the network spec should reflect
that: add the node's address to `INITIAL_VALIDATORS` and `STAKING_ADDRESSES` in `scripts/network-spec`.

## Simulation

We've created a [NetLogo model](./simulation/README.md) for simulating the
staking and rewards computation on networks of various sizes and having
different input parameters.
