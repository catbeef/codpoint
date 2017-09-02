import UTF8ToCPs from './utf8-to-cps';

class WTF8ToCPs extends UTF8ToCPs {}

Object.defineProperty(WTF8ToCPs.prototype, 'wtf', { value: true });

export default WTF8ToCPs;
