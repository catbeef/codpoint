const fs = require('fs');
const path = require('path');
const tap = require('tap');
const { Writable } = require('stream');

const {
  AbruptUTF8EOFError,
  InvalidUnicodeCodepointError,
  InvalidUTF8ByteError,
  InvalidUTF8ContinuationError,
  OrphanedUTF8ContinuationByteError,
  OverlongUTF8EncodingError,
  UTF8ToCPs,
  WTF8ToCPs
} = require('../dist');

const SCALARS_PATH = path.join(
  __dirname,
  './all-unicode-scalar-values-utf8-encoded.txt'
);

// BASIC TESTS w/ DIFFERENT CONTINUATION LENGTHS

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

// BOM HANDLING

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

tap.test('input of only BOM is valid empty string', tap => {
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
    tap.equal(buf.length, 0);
    tap.end();
  });

  stream.pipe(target);

  stream.end(Buffer.of(0xEF, 0xBB, 0xBF));
});

// ILL-FORMED UTF-8

const range = function * (start, end) { while (start < end) yield start++; };

const badBytesTest = (ErrCstr, start, end, ...append) => Array.from(
  range(start, end),
  byte => [ ErrCstr, Buffer.of(byte, ...append) ]
);

const surrogates = Array.from(range(0xDC00, 0xE000));

const wtf8Surrogates = surrogates.map(cp =>
  Buffer.of(0xED, (cp & 0o7700) >> 6 | 0o200, cp & 0b111111 | 0o200)
);

[
  ...badBytesTest(OrphanedUTF8ContinuationByteError, 0x80, 0xC0),
  ...badBytesTest(InvalidUTF8ContinuationError, 0xC0, 0xE0, 0x21),
  ...badBytesTest(InvalidUTF8ContinuationError, 0xE0, 0xF0, 0x21, 0x21),
  ...badBytesTest(InvalidUTF8ContinuationError, 0xF0, 0xF5, 0x21, 0x21, 0x21),
  ...badBytesTest(InvalidUTF8ByteError, 0xF5, 0x100),
  ...badBytesTest(AbruptUTF8EOFError, 0xC0, 0xF5),
  ...badBytesTest(AbruptUTF8EOFError, 0xE0, 0xF5, 0xC2),
  ...badBytesTest(AbruptUTF8EOFError, 0xF0, 0xF5, 0xC2, 0xC2),
  [ OverlongUTF8EncodingError, Buffer.of(0xC0, 0xAF) ],
  [ OverlongUTF8EncodingError, Buffer.of(0xE0, 0x80, 0xAF) ],
  [ OverlongUTF8EncodingError, Buffer.of(0xF0, 0x80, 0x80, 0xAF) ],
  ...wtf8Surrogates.map(buf => [ InvalidUnicodeCodepointError, buf ]),
  [ InvalidUnicodeCodepointError, Buffer.of(0xF0, 0x8D, 0xA0, 0x80) ],
  [ InvalidUnicodeCodepointError, Buffer.of(0xF0, 0x8D, 0xBF, 0xBF) ],
  [ InvalidUnicodeCodepointError, Buffer.of(0xF4, 0x90, 0x80, 0x80) ]
].forEach(([ ErrCstr, buf ]) => {
  tap.test(
    `${ [ ...buf ].toString(16) } sequence leads to ${ ErrCstr.name }`,
    tap => {
      const stream = new UTF8ToCPs();

      stream.on('data', () => undefined);

      stream.on('error', err => {
        tap.type(err, ErrCstr);
        tap.end();
      });

      stream.end(buf);
    }
  );
});

// META BEHAVIOR

tap.test('pushes valid codepoints up to error', tap => {
  let res;

  const stream = new UTF8ToCPs();

  stream.on('data', buf => {
    res = buf.readUInt32LE(0);
  });

  stream.on('error', err => {
    tap.equal(res, 0x21);
    tap.end();
  });

  stream.end(Buffer.of(0x21, 0xFF));
});

tap.test('handles multibyte encodings across chunk boundaries', tap => {
  tap.plan(6);

  const stream = new UTF8ToCPs();

  stream.on('data', buf => {
    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0x1F4A9);
    tap.equal(buf.readUInt32LE(4), 0x1F4A9);
  });

  stream.write(
    Buffer.of(0xF0, 0x9F, 0x92, 0xA9, 0xF0, 0x9F, 0x92, 0xA9, 0xF0, 0x9F)
  );

  stream.end(
    Buffer.of(0x92, 0xA9, 0xF0, 0x9F, 0x92, 0xA9)
  )
});

// SLAM IT

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

// WTF8

tap.test(`wtf8 permits sequences that decode to surrogate codepoints`, tap => {
  const chunks = [];
  const stream = new WTF8ToCPs();

  stream.on('data', chunk => chunks.push(chunk));

  stream.on('finish', () => {
    const out = Buffer.concat(chunks);

    tap.equal(out.length, surrogates.length * 4);

    for (let i = 0; i < out.length; i += 4) {
      tap.equal(out.readUInt32LE(i), surrogates[i / 4]);
    }

    tap.end();
  });

  stream.end(Buffer.concat(wtf8Surrogates));
});
