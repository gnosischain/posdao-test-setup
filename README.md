# Parity proof-of-stake test setup

This is an integration test of AuRa PoS with three Parity nodes running locally.


## Usage

To configure the repository and run tests, execute `npm run all`.


## Requirements

The `aura-pos` branch should be checked out in `../parity-ethereum` and built in
debug mode.


## Development

### Adding new validator nodes and their keys

To add a new validator node, Parity should generate an account together with its
secret key like so:

```
parity account new --config config/nodeX.toml --keys-path parity-data/nodeX/keys
```

given a node configuration file `config/nodeX.toml` and a newly created
directory `parity-data/nodeX/keys`. `config/nodeX.toml` should then be amended
with the validator address output by the above command. With this done, the node
can be added to the scripts.
