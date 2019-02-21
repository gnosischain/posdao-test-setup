#!/usr/bin/env bash
cd runtime-data
find . ! -name .gitkeep -delete
cd ..
node scripts/deploy-staking-token.js
