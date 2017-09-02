import { Transform } from 'stream';
import * as errors from './errors';

const ENDIANNESS = new Map([
  [ 'be', 'readUInt16BE' ],
  [ 'bom' ],
  [ 'le', 'readUInt16LE' ]
]);

class UTF16ToCPs extends Transform {
  constructor({ endianness='bom' }={}) {
    if (!ENDIANNESS.has(endianness)) {
      throw new TypeError(
        `opts.endianness must be 'be', 'le', or 'bom'; got ${ endianness }`
      );
    }

    super();

    this.pastBOM = endianness !== 'bom';
    this.readMethod = ENDIANNESS.get(endianness);
    this.reserved = undefined;
    this.reservedLength = 0;
  }

  _flush(done) {
    const { readMethod, reserved, reservedLength } = this;

    if (reservedLength) {
      if (!readMethod) {
        done(new errors.UTF16MissingBOMError());
      } else if (reservedLength % 2) {
        done(new errors.AbruptUTF16CodeUnitEOFError(...reserved.slice(-1)));
      } else if (this.wtf) {
        done(undefined, Buffer.from(Uint32Array.of(reserved[readMethod](0))));
      } else {
        done(new errors.AbruptUTF16SurrogateEOFError(reserved[readMethod](0)));
      }
    } else {
      done();
    }
  }

  _transform(utf16Buff, enc, done) {
    const utf16Length = utf16Buff.length + this.reservedLength;
    const utf32Arr = new Uint32Array(Math.floor(utf16Length / 2));

    let i = 0;
    let j = 0;

    if (this.reservedLength) {
      utf16Buff = Buffer.concat([ this.reserved, utf16Buff ], utf16Length);

      this.reservedLength = 0;
      this.reserved = undefined;
    }

    if (!this.pastBOM) {
      if (utf16Length < 2) {
        this.reserved = utf16Buff;
        this.reservedLength = utf16Length;
        done();
        return;
      }

      const a = utf16Buff[i++];
      const b = utf16Buff[i++];

      if (a === 0xFF && b === 0xFE) {
        this.pastBOM = true;
        this.readMethod = ENDIANNESS.get('le');
      } else if (a === 0xFE && b === 0xFF) {
        this.pastBOM = true;
        this.readMethod = ENDIANNESS.get('be');
      } else {
        done(new errors.UTF16MissingBOMError());
        return;
      }
    }

    try {
      while (i < utf16Length) {
        if (i + 1 === utf16Length) {
          this.reserved = utf16Buff.slice(i);
          this.reservedLength = 1;
          break;
        }

        const a = utf16Buff[this.readMethod](i);

        i += 2;

        // Initial code unit of two-unit encoded codepoint

        if (a >> 10 === 0b110110) {
          if (i === utf16Length) {
            this.reservedLength = 2;
            this.reserved = utf16Buff.slice(i - 2);
            break;
          }

          if (i + 1 === utf16Length) {
            this.reservedLength = 3;
            this.reserved = utf16Buff.slice(i - 2);
            break;
          }

          const b = utf16Buff[this.readMethod](i);

          i += 2;

          // Valid continuation

          if (b >> 10 === 0b110111) {
            const h = a ^ 0b1101100000000000;
            const l = b ^ 0b1101110000000000;

            utf32Arr[j++] = 0b10000000000000000 | h << 10 | l;

            continue;
          }

          // Invalid continuation: another high surrogate

          if (this.wtf && b >> 10 === 0b110110) {
            utf32Arr[j++] = a;
            i -= 2;
            continue;
          }

          // Invalid continuation

          if (this.wtf) {
            utf32Arr[j++] = a;
            utf32Arr[j++] = b;
            continue;
          }

          throw new errors.InvalidUTF16ContinuationError(a, b);
        }

        // Orphaned low surrogate code unit

        if (!this.wtf && a >> 10 === 0b110111) {
          throw new errors.UTF16OrphanedLowSurrogate(a);
        }

        // 1:1 code unit to codepoint

        utf32Arr[j++] = a;
        continue;
      }

      if (j) this.push(Buffer.from(utf32Arr.buffer, 0, j * 4));

      done();
    } catch (err) {
      if (j) this.push(Buffer.from(utf32Arr.buffer, 0, j * 4));

      done(err);
    }
  }
}

Object.defineProperty(UTF16ToCPs.prototype, 'wtf', { value: false });

export default UTF16ToCPs;
