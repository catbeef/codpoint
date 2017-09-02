import UTF16ToCPs from './utf16-to-cps';

class WTF16ToCPs extends UTF16ToCPs {}

Object.defineProperty(WTF16ToCPs.prototype, 'wtf', { value: true });

export default WTF16ToCPs;
