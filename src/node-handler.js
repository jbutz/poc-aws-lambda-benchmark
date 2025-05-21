const { createHash } = require('node:crypto');

const HASH_NUMBER = 50;

export async function handler() {
  const output = [];

  for (let i = 0; i < HASH_NUMBER; i++) {
    const hasher = createHash('sha3-512');
    hasher.update(
      `${new Date().toISOString()}-${Math.random()}-${Math.random()}`,
    );
    output.push(hasher.digest('hex'));
  }

  return output;
}
