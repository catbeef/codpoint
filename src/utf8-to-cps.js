import { Transform } from 'stream';
import * as errors from './errors';

const continuation = (byte, remaining, ...bytes) => {
  if (byte >> 6 !== 0b10) {
    throw new errors.InvalidUTF8ContinuationError(byte, remaining, bytes);
  }

  return byte & 0b111111;
};

class UTF8ToCPs extends Transform {
  constructor({ discardBOM=true }={}) {
    super();

    this.discardBOM = Boolean(discardBOM);
    this.pastBOM = false;
    this.reservedLength = 0;
    this.reservedTotal = 0;
    this.reserved = undefined;
  }

  _flush(done) {
    if (this.reservedLength) {
      done(new errors.AbruptUTF8EOFError(this.reserved, this.reservedTotal));
    } else {
      done();
    }
  }

  _transform(utf8Buff, enc, done) {
    const utf8Length = utf8Buff.length + this.reservedLength;
    const utf32Arr = new Uint32Array(utf8Length);

    let i = 0;
    let j = 0;

    if (this.reservedLength) {
      utf8Buff = Buffer.concat([ this.reserved, utf8Buff ], utf8Length);

      this.reservedLength = 0;
      this.reservedTotal = 0;
      this.reserved = undefined;
    }

    try {
      while (i < utf8Length) {
        const a = utf8Buff[i++];

        // 1:1 single byte: 0x00 to 0x7F

        if (a >> 7 === 0b00000000) {
          utf32Arr[j++] = a;
          continue;
        }

        const remainingByteCount = utf8Length - i;

        // Initial byte of two-byte encoded codepoint

        if (a >> 5 === 0b110) {
          if (remainingByteCount === 0) {
            this.reservedLength = remainingByteCount + 1;
            this.reservedTotal = 2;
            this.reserved = utf8Buff.slice(i - 1);
            break;
          }

          const b = continuation(utf8Buff[i++], 1, a);
          const x = (a & 0b11111) << 6 | b;

          if (x < 0x80)
            throw new errors.OverlongUTF8EncodingError([ a, b ], x);

          utf32Arr[j++] = x;
          continue;
        }

        // Initial byte of three-byte encoded codepoint

        if (a >> 4 === 0b1110) {
          if (remainingByteCount < 2) {
            this.reservedLength = remainingByteCount + 1;
            this.reservedTotal = 3;
            this.reserved = utf8Buff.slice(i - 1);
            break;
          }

          const b = continuation(utf8Buff[i++], 2, a);
          const c = continuation(utf8Buff[i++], 1, a, b);
          const x = (a & 0b1111) << 12 | b << 6 | c;

          if (x < 0x800)
            throw new errors.OverlongUTF8EncodingError([ a, b, c ], x);

          if (!this.wtf && x > 0xD7FF && x < 0xE000)
            throw new errors.InvalidUnicodeCodepointError([ a, b, c ], x);

          if (x === 0xFEFF && j === 0 && !this.pastBOM) {
            this.pastBOM = true;

            if (this.discardBOM) continue;
          }

          utf32Arr[j++] = x;
          continue;
        }

        // Initial byte of four-byte encoded codepoint

        if (a >> 3 === 0b11110) {
          if (a > 0xF4) throw new errors.InvalidUTF8ByteError(a);

          if (remainingByteCount < 3) {
            this.reservedLength = remainingByteCount + 1;
            this.reservedTotal = 4;
            this.reserved = utf8Buff.slice(i - 1);
            break;
          }

          const b = continuation(utf8Buff[i++], 3, a);
          const c = continuation(utf8Buff[i++], 2, a, b);
          const d = continuation(utf8Buff[i++], 1, a, b, c);
          const x = (a & 0b111) << 18 | b << 12 | c << 6 | d;

          if (x < 0x10000) {
            if (!this.wtf && x > 0xD7FF && x < 0xE000) {
              throw errors
                .InvalidUnicodeCodepointError
                .overlongToo([ a, b, c, d ], x);
            }

            throw new errors.OverlongUTF8EncodingError([ a, b, c, d ], x);
          }

          if (x > 0x10FFFF) {
            throw new errors.InvalidUnicodeCodepointError([ a, b, c, d ], x);
          }

          utf32Arr[j++] = x;
          continue;
        }

        if (a >> 6 === 0b10) {
          throw new errors.OrphanedUTF8ContinuationByteError(a);
        }

        throw new errors.InvalidUTF8ByteError(a);
      }

      if (j) {
        this.pastBOM = true;
        this.push(Buffer.from(utf32Arr.buffer, 0, j * 4));
      }

      done();
    } catch (err) {
      if (j) this.push(Buffer.from(utf32Arr.buffer, 0, j * 4));

      done(err);
    }
  }
}

Object.defineProperty(UTF8ToCPs.prototype, 'wtf', { value: false });

export default UTF8ToCPs;
