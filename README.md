# Parity proof-of-stake test setup

This is an integration test of AuRa PoS with three Parity nodes running locally.


## Usage

To configure the repository and run tests, execute `npm run all`.


## Requirements

To integrate with [parity-ethereum](https://github.com/poanetwork/parity-ethereum), the following structure of folders is assumed:
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
# clone over https
git clone -b aura-pos https://github.com/poanetwork/parity-ethereum.git
# OR over ssh
git clone -b aura-pos git@github.com:poanetwork/parity-ethereum.git
cd parity-ethereum
# assumes you have Rust and Cargo installed. With rustup use `rustup override set stable` to use latest stable
cargo build --release --features final
```
(_note that default branch is correctly set to **aura-pos** which contains the posdao features, not to master_)

Otherwise, to save time, you can download one of pre-compiled binaries for Ubuntu or Mac OS X from the [releases page](https://github.com/poanetwork/parity-ethereum/releases). But you still need to maintain directory structure and naming conventions:
```bash
# move up from posdao-test-setup root
cd ..
mkdir -p parity-ethereum/target/release/
# you can replace the links below with the specific release version
# select either Ubuntu 18.04
curl -SfL 'https://github.com/poanetwork/parity-ethereum/releases/latest/download/parity-ubuntu-18.04.zip' -o parity.zip
# OR Mac OS X
curl -SfL 'https://github.com/poanetwork/parity-ethereum/releases/latest/download/parity-macos.zip' -o parity.zip
unzip parity.zip -d parity-ethereum/target/release
chmod +x parity-ethereum/target/release/parity
# check that it works and version is correct (compare commit hash from the binary with hash on the release page)
parity-ethereum/target/release/parity --version
rm parity.zip
```


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
that: add the node's address to `INITIAL_VALIDATORS` in `scripts/network-spec`.

## Simulation

We've created a [NetLogo model](./simulation/README.md) for simulating the
staking and rewards computation on networks of various sizes and having
different input parameters.
