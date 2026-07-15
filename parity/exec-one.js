'use strict';
// Single-fixture runner, invoked in a FRESH child process per fixture per
// implementation so env vars (read at call time or module-load time) and the
// module cache never leak between cases.
//
//   node exec-one.js <modulePath> <fixturePath>
//
// The parent sets env (fixture.env) before spawning. Prints the full execute()
// result as JSON with undefined property values preserved as the sentinel
// string "__UNDEFINED__" (JSON.stringify would otherwise drop those keys and
// hide key-set differences between implementations).
const fs = require('fs');
const path = require('path');

const modulePath = process.argv[2];
const fixturePath = process.argv[3];
if (!modulePath || !fixturePath) {
  console.error('usage: node exec-one.js <modulePath> <fixturePath>');
  process.exit(2);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const { execute } = require(path.resolve(modulePath));
const result = execute(fixture.input);
process.stdout.write(JSON.stringify(result, (key, value) => (value === undefined ? '__UNDEFINED__' : value)));
