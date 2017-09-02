[![Build Status](https://travis-ci.org/catbeef/codpoint.svg)](https://travis-ci.org/catbeef/codpoint)
[![Coverage Status](https://coveralls.io/repos/github/catbeef/codpoint/badge.svg?branch=master)](https://coveralls.io/github/catbeef/codpoint?branch=master)
[![npm version](https://badge.fury.io/js/codpoint.svg)](https://badge.fury.io/js/codpoint)

# codpoint

This lib exposes a set of transform streams that consume raw buffer chunks and
decode them as UTF8, UTF16, WTF8, or WTF16. However they decode them to buffers
of codepoints (in other words, UTF32, or I suppose WTF32), not to strings.

I found myself needing to do this repeatedly and realized it was worth spinning
off into a standalone lib.

## why

Naturally one can do some of this pretty easily with built-in decoding:

    fs.createReadStream(filename, 'utf8').pipe(new Writable({
      write: (chunk, enc, done) => {
        const cps = Uint32Array.from(
          Array.from(chunk).map(char => char.codePointAt(0))
        );
    
        /*... congrats u got em ...*/
      }
    }));

Though nice and simple, this isn’t a particularly efficient way to get at the
codepoints, and at least in my experience the reason I’ve usually needed to get
at codepoints in the first place is because something is performance-sensitive.
The native decoder is decoding utf8 to codepoints, but it then converts that
into a string, and then you need to convert it back from a string to codepoints.
So the main purpose of this lib is to eliminate the pointless steps there.

There are a few other distinctions:

- the native decoder will output the `\uFFFD` replacement character in place of
  ill-formed encoding sequences, but because this lib is meant for internal
  processing rather than user-facing text handling, these streams instead will
  throw errors for ill-formed sequences (with certain exceptions permitted when
  using the WTF\* encodings)
- the WTF8 decoder permits sequences that would decode to UTF16 surrogate code
  units and passes these along as if they were valid unicode scalar values
- the WTF16 decoder permits unpaired surrogate code units to pass through as if
  they were valid unicode scalar values
- handling of BOM is configurable for UTF8 and detecting endianness of utf16
  from the BOM is supported

## usage

    import { UTF16ToCPs, UTF8ToCPs, WTF16ToCPs, WTF8ToCPs } from 'codpoint';
    
    fs.createReadStream(fileName).pipe(new UTF8ToCPs()).pipe(/* my consumer */);

The consumer will receive buffers of codepoints (effectively, this is UTF32le,
unless using a WTF\* decoder). You could read them from the node buffer
interface:

    for (let i = 0; i < buf.length; i += 4) {
      const cp = buf.readUInt32LE(i);
      /* do stuf */
    }

Or you could read them from a regular typed array view:

    for (const cp of new Uint32Array(buf.buffer, buf.offset, buf.length)) {
      /* do stuf */
    }

You could also use `DataView`, etc. THE POSSIBILITIES R ENDLESS

## options

The constructors each accept an options object.

### UTF8ToCPs and WTF8ToCPs

- `options.discardBOM`: default `true`. when true, an initial BOM is not piped
  through as a codepoint

### UTF16ToCPs and WTF16ToCPs

- `options.endianness`: default `'bom'`. the possible values are 'bom', 'le' and
  'be', which are effectively saying to decode \*TF16, \*TF16LE and \*TF16BE
  respectively.

Note that 'discardBOM' is not an option here since the semantics vary from UTF8,
where the BOM isn’t really a BOM so much as a sentinel value. In UTF16, the BOM
is not optional and is not part of the text. UTF16LE and UTF16BE are defined as
having no BOM; it’d unambiguously be a ZWNBSP.

## errors

Various rather specific error constructors like `InvalidUTF8ContinuationError`
are also exported. They’ll tell you what went wrong, but line/column is not
tracked.
