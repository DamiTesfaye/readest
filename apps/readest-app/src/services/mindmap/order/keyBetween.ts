const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = '0';
const LAST_DIGIT = 'z';
const FIRST_KEY = 'a0';
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;
const KEY_PATTERN = /^[A-Za-z][0-9A-Za-z]*$/;

export interface OrderedRecord {
  id: string;
  index: string;
}

const integerLength = (head: string): number => {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new RangeError(`invalid order key head: ${head}`);
};

const integerPart = (key: string): string => {
  const length = integerLength(key.charAt(0));
  if (length > key.length) throw new RangeError(`invalid order key: ${key}`);
  return key.slice(0, length);
};

const validateKey = (key: string): void => {
  if (!KEY_PATTERN.test(key) || key === SMALLEST_INTEGER) {
    throw new RangeError(`invalid order key: ${key}`);
  }
  if (key.slice(integerPart(key).length).endsWith(ZERO)) {
    throw new RangeError(`invalid order key: ${key}`);
  }
};

const midpoint = (a: string, b: string | null): string => {
  if (b !== null) {
    let shared = 0;
    while ((a.charAt(shared) || ZERO) === b.charAt(shared)) shared += 1;
    if (shared > 0) return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
  }
  const digitA = a ? DIGITS.indexOf(a.charAt(0)) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b.charAt(0)) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS.charAt(Math.round((digitA + digitB) / 2));
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS.charAt(digitA) + midpoint(a.slice(1), null);
};

const incrementInteger = (value: string): string | null => {
  const head = value.charAt(0);
  const digits = value.slice(1).split('');
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i -= 1) {
    const next = DIGITS.indexOf(digits[i]!) + 1;
    if (next === DIGITS.length) {
      digits[i] = ZERO;
    } else {
      digits[i] = DIGITS.charAt(next);
      carry = false;
    }
  }
  if (!carry) return head + digits.join('');
  if (head === 'Z') return `a${ZERO}`;
  if (head === 'z') return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
  if (nextHead > 'a') digits.push(ZERO);
  else digits.pop();
  return nextHead + digits.join('');
};

const decrementInteger = (value: string): string | null => {
  const head = value.charAt(0);
  const digits = value.slice(1).split('');
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i -= 1) {
    const next = DIGITS.indexOf(digits[i]!) - 1;
    if (next === -1) {
      digits[i] = LAST_DIGIT;
    } else {
      digits[i] = DIGITS.charAt(next);
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join('');
  if (head === 'a') return `Z${LAST_DIGIT}`;
  if (head === 'A') return null;
  const nextHead = String.fromCharCode(head.charCodeAt(0) - 1);
  if (nextHead < 'Z') digits.push(LAST_DIGIT);
  else digits.pop();
  return nextHead + digits.join('');
};

const keyBefore = (b: string): string => {
  const integer = integerPart(b);
  if (integer === SMALLEST_INTEGER) return integer + midpoint('', b.slice(integer.length));
  if (integer < b) return integer;
  const decremented = decrementInteger(integer);
  if (decremented === null)
    throw new RangeError('keyBetween: no key sorts before the smallest key');
  return decremented;
};

const keyAfter = (a: string): string => {
  const integer = integerPart(a);
  const incremented = incrementInteger(integer);
  return incremented ?? integer + midpoint(a.slice(integer.length), null);
};

export const keyBetween = (a: string | null, b: string | null): string => {
  if (a !== null) validateKey(a);
  if (b !== null) validateKey(b);
  if (a !== null && b !== null && a >= b) throw new RangeError(`keyBetween: ${a} >= ${b}`);
  if (a === null) return b === null ? FIRST_KEY : keyBefore(b);
  if (b === null) return keyAfter(a);
  const integerA = integerPart(a);
  const integerB = integerPart(b);
  if (integerA === integerB) {
    return integerA + midpoint(a.slice(integerA.length), b.slice(integerB.length));
  }
  const incremented = incrementInteger(integerA);
  if (incremented !== null && incremented < b) return incremented;
  return integerA + midpoint(a.slice(integerA.length), null);
};

export const isValidOrderKey = (key: string): boolean => {
  try {
    validateKey(key);
    return true;
  } catch {
    return false;
  }
};

export const compareByIndex = (a: OrderedRecord, b: OrderedRecord): number => {
  if (a.index !== b.index) return a.index < b.index ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};
