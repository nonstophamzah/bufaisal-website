#!/usr/bin/env node
// Generate bcrypt hashes for admin PINs.
// Usage: node scripts/generate-pin-hashes.js 0000 3333
// Output: JSON array suitable for ADMIN_PIN_HASHES env var.

const bcrypt = require('bcryptjs');

const pins = process.argv.slice(2);
if (pins.length === 0) {
  console.log('Usage: node scripts/generate-pin-hashes.js <pin1> <pin2> ...');
  console.log('Example: node scripts/generate-pin-hashes.js 0000 3333');
  process.exit(1);
}

const names = ['Admin', 'Humaan', 'Manager', 'Staff', 'Owner'];

Promise.all(
  pins.map(async (pin, i) => ({
    hash: await bcrypt.hash(pin, 10),
    name: names[i] || `User${i + 1}`,
  }))
).then((entries) => {
  console.log('\nSet this as ADMIN_PIN_HASHES in your .env.local:\n');
  console.log(JSON.stringify(entries));
  console.log();
});
