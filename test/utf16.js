const fs = require('fs');
const path = require('path');
const tap = require('tap');
const { Writable } = require('stream');

const {
  AbruptUTF16CodeUnitEOFError,
  AbruptUTF16SurrogateEOFError,
  InvalidUTF16ContinuationError,
  InvalidUnicodeCodepointError,
  UTF16MissingBOMError,
  UTF16OrphanedLowSurrogate,
  UTF16ToCPs,
  WTF16ToCPs,
} = require('../dist');

const SCALARS_PATH = path.join(
  __dirname,
  './all-unicode-scalar-values-utf16le-encoded.txt'
);

// BASIC TESTS

[
  'abcdef',
  '\0\0\0',
  'αβγδεζ',
  '𒁫𒀶𒂷𒅓𒋧'
].forEach(str => {
  tap.test(`decodes UTF16 (LE): "${ str }"`, tap => {
    let res = new Buffer(0);

    const expected = new Buffer(
      Uint32Array
        .from(Array.from(str).map(char => char.codePointAt(0)))
        .buffer
    );

    const stream = new UTF16ToCPs({ endianness: 'le' });

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
    stream.end(Buffer.from(str, 'utf16le'));
  });
});

// ENDIANNESS & BOM

tap.test('uses BOM by default; reads LE BOM', tap => {
  const stream = new UTF16ToCPs();

  stream.on('data', buf => {
    tap.equal(buf.length, 4);
    tap.equal(buf.readUInt32LE(0), 0x21);
    tap.end();
  });

  stream.end(Buffer.of(0xFF, 0xFE, 0x21, 0x00));
});

tap.test('reads BE BOM', tap => {
  const stream = new UTF16ToCPs({ endianness: 'bom' });

  stream.on('data', buf => {
    tap.equal(buf.length, 4);
    tap.equal(buf.readUInt32LE(0), 0x21);
    tap.end();
  });

  stream.end(Buffer.of(0xFE, 0xFF, 0x00, 0x21));
});

tap.test('requires BOM if other endianness not specified', tap => {
  const stream = new UTF16ToCPs({ endianness: 'bom' });

  stream.on('error', err => {
    tap.type(err, UTF16MissingBOMError);
    tap.end();
  });

  stream.end(Buffer.of(0x21));
});

tap.test('handles bad BOM w/ ambiguous first write', tap => {
  const stream = new UTF16ToCPs({ endianness: 'bom' });

  stream.on('error', err => {
    tap.type(err, UTF16MissingBOMError);
    tap.end();
  });

  stream.write(Buffer.of(0xFE));
  stream.end(Buffer.of(0x00));
});

tap.test('handles bad BOM due to abrupt EOF', tap => {
  const stream = new UTF16ToCPs({ endianness: 'bom' });

  stream.on('error', err => {
    tap.type(err, UTF16MissingBOMError);
    tap.end();
  });

  stream.end(Buffer.of(0xFE));
});

tap.test('throws for invalid endianness', tap => {
  tap.throws(() => new UTF16ToCPs({ endianness: 'poop' }));
  tap.end();
});

// BAD INPUT

tap.test('emits error for lonely final high surrogate', tap => {
  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('error', err => {
    tap.type(err, AbruptUTF16SurrogateEOFError);
    tap.end();
  });

  stream.end(Buffer.of(0x3D, 0xD8));
});

tap.test('emits error for odd number of bytes', tap => {
  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('error', err => {
    tap.type(err, AbruptUTF16CodeUnitEOFError);
    tap.end();
  });

  stream.end(Buffer.of(0x21));
});

tap.test('emits error for bad continuation', tap => {
  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('error', err => {
    tap.type(err, InvalidUTF16ContinuationError);
    tap.end();
  });

  stream.end(Buffer.of(0x3D, 0xD8, 0x21, 0x00));
});

tap.test('emits error for bad continuation (another high surrogate)', tap => {
  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('error', err => {
    tap.type(err, InvalidUTF16ContinuationError);
    tap.end();
  });

  stream.end(Buffer.of(0x3D, 0xD8, 0x3D, 0xD8));
});

tap.test('emits error for lonely low surrogate', tap => {
  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('error', err => {
    tap.type(err, UTF16OrphanedLowSurrogate);
    tap.end();
  });

  stream.end(Buffer.of(0xA9, 0xDC, 0x21));
});

// META BEHAVIOR

tap.test('decodes UTF16 with within-unit continuation across chunks', tap => {
  tap.plan(6);

  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0x1F4A9);
    tap.equal(buf.readUInt32LE(4), 0x1F4A9);
  });

  stream.write(Buffer.of(0x3D, 0xD8, 0xA9, 0xDC, 0x3D, 0xD8, 0xA9, 0xDC, 0x3D));
  stream.end(Buffer.of(0xD8, 0xA9, 0xDC, 0x3D, 0xD8, 0xA9, 0xDC));
});

tap.test('decodes UTF16 with between-unit continuation across chunks', tap => {
  tap.plan(6);

  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0x1F4A9);
    tap.equal(buf.readUInt32LE(4), 0x1F4A9);
  });

  stream.write(
    Buffer.of(0x3D, 0xD8, 0xA9, 0xDC, 0x3D, 0xD8, 0xA9, 0xDC, 0x3D, 0xD8)
  );

  stream.end(
    Buffer.of(0xA9, 0xDC, 0x3D, 0xD8, 0xA9, 0xDC)
  );
});

tap.test('...within-unit & between-unit continuation across chunks', tap => {
  tap.plan(6);

  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0x1F4A9);
    tap.equal(buf.readUInt32LE(4), 0x1F4A9);
  });

  stream.write(
    Buffer.of(0x3D, 0xD8, 0xA9, 0xDC, 0x3D, 0xD8, 0xA9, 0xDC, 0x3D, 0xD8, 0xA9)
  );

  stream.end(
    Buffer.of(0xDC, 0x3D, 0xD8, 0xA9, 0xDC)
  );
});

tap.test('pushes cps up until first error', tap => {
  tap.plan(3);

  const stream = new UTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 4);
    tap.equal(buf.readUInt32LE(0), 0x21);
  });

  stream.on('error', err => {
    tap.type(err, UTF16OrphanedLowSurrogate);
  });

  stream.end(Buffer.of(0x21, 0x00, 0xA9, 0xDC));
});

// SLAM IT

tap.test(`decodes all unicode scalars in UTF16`, tap => {
  let expectedCP = 0;

  const stream = new UTF16ToCPs({ endianness: 'le' });

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

// WTF-16

tap.test('wtf-16 permits orphaned high (medial)', tap => {
  tap.plan(4);

  const stream = new WTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 12);
    tap.equal(buf.readUInt32LE(0), 0x0021);
    tap.equal(buf.readUInt32LE(4), 0xD83D);
    tap.equal(buf.readUInt32LE(8), 0x0021);
  });

  stream.end(Buffer.of(0x21, 0x00, 0x3D, 0xD8, 0x21, 0x00));
});

tap.test('wtf-16 permits orphaned high (terminal)', tap => {
  const bufs = [];
  const stream = new WTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => bufs.push(buf));

  stream.on('finish', () => {
    const buf = Buffer.concat(bufs);

    tap.equal(buf.length, 8);
    tap.equal(buf.readUInt32LE(0), 0x0021);
    tap.equal(buf.readUInt32LE(4), 0xD83D);
    tap.end();
  });

  stream.end(Buffer.of(0x21, 0x00, 0x3D, 0xD8));
});

tap.test('wtf-16 permits orphaned high (followed by another)', tap => {
  const stream = new WTF16ToCPs({ endianness: 'le' });

  stream.on('data', buf => {
    tap.equal(buf.length, 12);
    tap.equal(buf.readUInt32LE(0), 0x0D83D);
    tap.equal(buf.readUInt32LE(4), 0x0D83D);
    tap.equal(buf.readUInt32LE(8), 0x1F4A9);
    tap.end();
  });

  stream.end(Buffer.of(0x3D, 0xD8, 0x3D, 0xD8, 0x3D, 0xD8, 0xA9, 0xDC));
});
