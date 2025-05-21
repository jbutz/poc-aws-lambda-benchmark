#!/bin/bash

mkdir -p ./tmp

cd ./tmp

git clone --filter=blob:none --sparse https://github.com/oven-sh/bun.git
git -C bun sparse-checkout set packages/bun-lambda

cd bun/packages/bun-lambda
bun install

#bun run publish-layer --layer bun \
#    --arch x64 \
#    --region us-east-2

bun run build-layer --layer bun-arm64 \
    --arch aarch64 \
    --region us-east-2
