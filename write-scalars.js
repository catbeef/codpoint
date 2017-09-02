const utf8Stream = require('fs')
  .createWriteStream('./test/all-unicode-scalar-values-utf8-encoded.txt');

const utf16LEStream = require('fs')
  .createWriteStream('./test/all-unicode-scalar-values-utf16le-encoded.txt', {
    defaultEncoding: 'utf16le'
  });

for (let i = 0; i < 0xD800; i++) {
  utf8Stream.write(String.fromCodePoint(i));
  utf16LEStream.write(String.fromCodePoint(i));
}

for (let i = 0xE000; i < 0x110000; i++) {
  utf8Stream.write(String.fromCodePoint(i));
  utf16LEStream.write(String.fromCodePoint(i));
}

utf8Stream.end();
utf16LEStream.end();
