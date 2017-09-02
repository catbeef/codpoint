const correctUTF8Bytes = cp =>
  Buffer.from(String.fromCodePoint(cp));

const renderByte = byte =>
  `0x${ byte.toString(16).padStart(2, '0').toUpperCase() }`;

const renderBytes = ([ first, ...rest ]) => {
  const bytes = [ first, rest.map(n => n | 0b10000000) ];
  return `[ ${ Array.from(bytes).map(renderByte).join(' ') } ]`;
};

const renderChar = cp =>
  `"${ String.fromCodePoint(cp) }"`;

const renderCP = cp =>
  `\\u{${ cp.toString(16).toUpperCase() }}`;

const renderCPAndChar = cp =>
  `${ renderCP(cp) } (${ renderChar(cp) })`;

const renderFollowedBy = remaining =>
  remaining === 1 ? `one continuation byte` :
  remaining === 2 ? `two continuation bytes` :
  `three continuation bytes`;

const renderUnit = unit =>
  `0x${ unit.toString(16).padStart(4, '0').toUpperCase() }`;

export class AbruptUTF8EOFError extends Error {
  constructor(initialBytes, length) {
    const remaining = initialBytes.length - length;

    super(
      `The byte sequence ${ renderBytes(initialBytes) } should have been ` +
      `followed by ${ renderFollowedBy(remaining) }, but was instead ` +
      `abruptly terminated by the end of input`
    );
  }
}

export class AbruptUTF16CodeUnitEOFError extends Error {
  constructor(initialByte) {
    super(
      `The UTF16 input ended with an odd number of bytes; received lone byte ` +
      `${ renderByte(initialByte) }, which is not a complete code unit`
    );
  }
}

export class AbruptUTF16SurrogateEOFError extends Error {
  constructor(unit) {
    super(
      `The UTF16 input ended abruptly after the high surrogate ` +
      `${ renderUnit(unit) }, which must be followed by a low surrogate`
    );
  }
}

export class InvalidUnicodeCodepointError extends Error {
  constructor(bytes, cp) {
    super(
      `The byte sequence ${ renderBytes(bytes) } ` +
      `decodes to ${ renderCP(cp) }, which is not a valid Unicode codepoint`
    );
  }

  static overlongToo(bytes, cp) {
    const err = new this(bytes, cp);

    Error.captureStackTrace(err, this.overlongToo);

    err.message += ` (also, the encoding would be overlong even if it were)`;

    return err;
  }
}

export class InvalidUTF8ByteError extends Error {
  constructor(offendingByte) {
    super(
      `The byte ${ renderByte(offendingByte) } is not a recognized code unit ` +
      `in UTF8 encoding`
    );
  }
}

export class InvalidUTF8ContinuationError extends Error {
  constructor(offendingByte, remaining, initialBytes) {
    super(
      `The byte sequence ${ renderBytes(initialBytes) } should have been ` +
      `followed by ${ renderFollowedBy(remaining) }, but was instead ` +
      `followed by ${ renderByte(offendingByte) }, which is not a ` +
      `continuation byte`
    );
  }
}

export class InvalidUTF16ContinuationError extends Error {
  constructor(highSurrogate, offendingByte) {
    super(
      `The high surrogate code unit ${ renderUnit(highSurrogate) } must be ` +
      `followed by a low surrogate code unit, but encountered ` +
      `${ renderUnit(offendingByte) } instead`
    );
  }
}

export class OrphanedUTF8ContinuationByteError extends Error {
  constructor(offendingByte) {
    super(
      `Encountered continuation byte ${ renderByte(offendingByte) } ` +
      `orphaned where no continuation was expected`
    );
  }
}

export class OverlongUTF8EncodingError extends Error {
  constructor(bytes, cp) {
    super(
      `The byte sequence ${ renderBytes(bytes) } is overlong — ` +
      `it decodes to ${ renderCPAndChar(cp) }, whose correct representation ` +
      `is ${ renderBytes(correctUTF8Bytes(cp)) }`
    );
  }
}

export class UTF16MissingBOMError extends Error {
  constructor() {
    super(
      `Decoding UTF16 without specifying an explicit endianness requires ` +
      `that the input begin with a BOM`
    );
  }
}

export class UTF16OrphanedLowSurrogate extends Error {
  constructor(unit) {
    super(
      `Encountered orphaned UTF16 low surrogate code unit ${ renderUnit(unit) }`
    );
  }
}
