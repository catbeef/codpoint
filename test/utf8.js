const fs = require('fs');
const path = require('path');
const tap = require('tap');
const { UTF8ToCPs } = require('../dist');
const { Writable } = require('stream');

const SCALARS_PATH = path.join(
  __dirname,
  './all-unicode-scalar-values-utf8-encoded.txt'
);

[
  'abcdef',
  '\0\0\0',
  '\u{80}\u{7F}\u{81}',
  '\u{800}\u{7FF}\u{801}',
  '\u{10000}\u{FFFF}\u{10001}'
].forEach(str => {
  tap.test(`decodes UTF8: "${ str }"`, tap => {
    let res = new Buffer(0);

    const expected = new Buffer(
      Uint32Array
        .from(Array.from(str).map(char => char.codePointAt(0)))
        .buffer
    );

    const stream = new UTF8ToCPs();

    const target = new Writable({
      write(buf, enc, done) {
        res = Buffer.concat([ res, buf ]);
        done();
      }
    });

    target.on('finish', () => {
      tap.ok(Buffer.compare(res, expected) === 0);
      tap.end();
    });

    stream.pipe(target);
    stream.end(str);
  });
});

tap.test(`decodes all unicode scalars in UTF8`, tap => {
  let expectedCP = 0;

  const stream = new UTF8ToCPs();

  const target = new Writable({
    write(buf, enc, done) {
      for (let i = 0; i < buf.length; i += 4) {
        const cp = buf.readUInt32LE(i);

        if (expectedCP !== cp) {
          return done(new Error(
            `mismatch: ${ cp.toString(16) } is not ${ expectedCP.toString(16) }`
          ));
        }

        expectedCP++;

        if (expectedCP === 0xD800) expectedCP = 0xE000;
      }

      done();
    }
  });

  target.on('finish', () => {
    tap.equal(expectedCP, 0x110000);
    tap.end();
  });

  fs
    .createReadStream(SCALARS_PATH)
    .pipe(stream)
    .pipe(target);
});

tap.test('discards BOM by default', tap => {
  const bufs = [];

  const stream = new UTF8ToCPs();

  const target = new Writable({
    write(buf, enc, done) {
      bufs.push(buf);
      done();
    }
  });

  target.on('finish', () => {
    const buf = Buffer.concat(bufs);
    tap.equal(buf.length, 4);
    tap.equal(buf.readUInt32LE(0), 0x21);
    tap.end();
  });

  stream.pipe(target);

  stream.end(Buffer.of(0xEF, 0xBB, 0xBF, 0x21));
});

tap.test('includes BOM with discardBOM:false', tap => {
  const bufs = [];

  const stream = new UTF8ToCPs({ discardBOM: false });

  const target = new Writable({
    write(buf, enc, done) {
      bufs.push(buf);
      done();
    }
  });

  target.on('finish', () => {
    const buf = Buffer.concat(bufs);
    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0xFEFF);
    tap.equal(buf.readUInt32LE(4), 0x21);
    tap.end();
  });

  stream.pipe(target);

  stream.end(Buffer.of(0xEF, 0xBB, 0xBF, 0x21));
});
