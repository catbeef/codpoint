const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const { UTF8ToCPs } = require('../dist');

const SCALARS_PATH = path.join(
  __dirname,
  './all-unicode-scalar-values-utf8-encoded.txt'
);

const toCPsNative = () => new Promise(fulfill => {
  const target = new Writable({
    write(chunk, enc, done) {
      const cps = Uint32Array.from(String(chunk), char => char.codePointAt(0));

      for (const cp of cps) {
        this.sum += cp;
      }

      done();
    }
  });

  target.sum = 0;

  target.on('finish', () => fulfill(target.sum));

  fs.createReadStream(SCALARS_PATH).pipe(target);
});

const toCPsCodpoint = () => new Promise(fulfill => {
  const stream = new UTF8ToCPs();

  const target = new Writable({
    write(chunk, end, done) {
      for (let i = 0; i < chunk.length; i += 4) {
        this.sum += chunk.readUInt32LE(i);
      }

      done();
    }
  });

  target.sum = 0;

  target.on('finish', () => fulfill(target.sum));

  fs.createReadStream(SCALARS_PATH).pipe(stream).pipe(target);
});

const exec = fn => {
  const time = process.hrtime();
  return fn().then(() => process.hrtime(time));
};

const test = async (label, fn) => {
  const times = [];

  let i = 100;

  while (i--) times.push(await exec(fn));

  const ms = times
    .map(([ s, n ]) => s * 1000 + n / 1e6)
    .reduce((acc, ms, i, { length }) => acc + (ms / length), 0);

  console.log(
    `${ label }: ${ times.length } iterations over all unicode scalars ` +
    `averaged ${ ms }ms`
  );
};

(async () => {
  await test('native decode utf8 to CPs', toCPsNative);
  await test('codpoint decode utf8 to CPs', toCPsCodpoint);
})();
