import { Decimal128 } from "mongodb";

const MAX_CANONICAL_DECIMAL_LENGTH = 6200;
const PLAIN_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

type DecimalMeaning = {
  coefficient: string;
  fractionalScale: number;
};

export function expandScientificDecimal(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?)(\d+)$/.exec(value);
  if (!match) return value;

  const sign = match[1] ?? "";
  const integer = match[2] ?? "";
  const fraction = match[3] ?? "";
  const exponentSign = match[4] ?? "";
  const exponentDigits = match[5] ?? "";
  const magnitude = [...exponentDigits].reduce(
    (result, digit) => result * 10 + digit.charCodeAt(0) - 48,
    0,
  );
  const exponent = exponentSign === "-" ? -magnitude : magnitude;
  const digits = `${integer}${fraction}`;
  const decimalIndex = integer.length + exponent;
  if (decimalIndex <= 0) return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function decimalMeaning(plain: string): DecimalMeaning {
  const unsigned = plain.startsWith("-") ? plain.slice(1) : plain;
  const [integer = "", fraction = ""] = unsigned.split(".");
  const digits = `${integer}${fraction}`.replace(/^0+/, "") || "0";
  const coefficient = digits === "0" ? "0" : `${plain.startsWith("-") ? "-" : ""}${digits}`;
  return { coefficient, fractionalScale: fraction.length };
}

export function parseCanonicalDecimal128(value: string): Decimal128 {
  if (value.length > MAX_CANONICAL_DECIMAL_LENGTH) {
    throw new Error("canonical decimal은 6200자를 초과할 수 없습니다");
  }
  if (!PLAIN_DECIMAL.test(value)) {
    throw new Error("canonical decimal은 지수 표기 없는 decimal 문자열이어야 합니다");
  }
  let decimal: Decimal128;
  try {
    decimal = Decimal128.fromString(value);
  }
  catch {
    throw new Error("canonical decimal을 Decimal128에 rounding 없이 저장할 수 없습니다");
  }
  const roundTrip = expandScientificDecimal(decimal.toString());
  const before = decimalMeaning(value);
  const after = decimalMeaning(roundTrip);
  if (before.coefficient !== after.coefficient || before.fractionalScale !== after.fractionalScale) {
    throw new Error("canonical decimal의 값 또는 fractional scale을 Decimal128 round-trip에서 보존할 수 없습니다");
  }
  return decimal;
}

export function decimal128ToCanonicalPlain(value: Decimal128): string {
  const plain = expandScientificDecimal(value.toString());
  parseCanonicalDecimal128(plain);
  return plain;
}
