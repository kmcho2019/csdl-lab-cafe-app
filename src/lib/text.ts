const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

export function hasControlCharacters(value: string): boolean {
  return CONTROL_CHAR_REGEX.test(value);
}
