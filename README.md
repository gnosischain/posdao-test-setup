# POSDAO test setup

This is an integration test of AuRa POSDAO with seven OpenEthereum (or Nethermind) nodes running locally from the genesis block.


## Ethereum client installation

### OpenEthereum

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

To save time, you can download a pre-compiled binary from the [releases page](https://github.com/openethereum/openethereum/releases) (versions >= v3.3.0-rc.11 are supported). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
$ cd ..
$ mkdir -p openethereum/target/release/
# an example for macOS binary
$ curl -SfL 'https://github.com/openethereum/openethereum/releases/download/v3.3.0-rc.11/openethereum-macos-v3.3.0-rc.11.zip' -o openethereum/target/release/openethereum.zip
$ unzip openethereum/target/release/openethereum.zip -d openethereum/target/release
$ chmod +x openethereum/target/release/openethereum
# check that it works and the version is correct (compare the version from the binary with version on the release page)
$ openethereum/target/release/openethereum --version
```

### Nethermind

To integrate with [Nethermind](https://github.com/NethermindEth/nethermind), the following structure of folders is assumed:
```
.
├── nethermind
├── posdao-test-setup
```
So there should be two folders on the same level and `posdao-test-setup` will use a binary from the `nethermind` folder, namely the binary is assumed to be at `../nethermind/bin/Nethermind.Runner` relative to `posdao-test-setup` root.

A pre-compiled binary can be downloaded from the [releases page](https://github.com/NethermindEth/nethermind/releases) (versions >= v1.11.4 are supported). You need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
$ cd ..
$ mkdir -p nethermind/bin
# an example for Linux binary
$ curl -SfL 'https://nethdev.blob.core.windows.net/builds/nethermind-linux-amd64-1.11.4-f787085.zip' -o nethermind/bin/nethermind.zip
$ unzip nethermind/bin/nethermind.zip -d nethermind/bin
$ chmod +x nethermind/bin/Nethermind.Runner
# check that it works and version is correct (compare the version from the binary with version on the release page)
$ nethermind/bin/Nethermind.Runner --version
```


## Usage

After OpenEthereum client is downloaded or built (see above), the integration test can be launched with `npm run all` (in the root of `posdao-test-setup` working directory). To use Nethermind client instead, the integration test should be launched with `npm run all-nethermind`.

To stop the tests, use `npm run stop-test-setup` (or just use `CTRL+C` in the console).

To stop and clear directories, use `npm run cleanup` in a separate console.

To restart the tests from scratch just run `npm run all` (or `npm run all-nethermind`) again.

To monitor blocks and transactions, use `npm run watcher` in a separate console.


## Development

### Adding new validator nodes and their keys (for OpenEthereum client only)

To add a new validator node, OpenEthereum should generate an account together with its
secret key like so:

```
$ ./openethereum/target/release/openethereum account new --config config/nodeX.openethereum.toml --keys-path ./posdao-test-setup/data/nodeX/keys
```

given a node configuration file `config/nodeX.openethereum.toml` and a newly created
directory `data/nodeX/keys`. `config/nodeX.openethereum.toml` should then be amended
with the validator address output by the above command. Also, the keys directory
`data/nodeX/keys` should be committed to the Git repository: it is part
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
