# Parity proof-of-stake test setup

This is an integration test of AuRa PoS with three Parity nodes running locally.


## Usage

To configure the repository and run tests, execute `npm run all`.


## Requirements

The `aura-pos` branch should be checked out in `../parity-ethereum` and built in
release mode.


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
