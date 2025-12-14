export function csvEscape(value: string) {
  if (value.includes('"')) {
    value = value.replaceAll('"', '""');
  }

  if (/[",\n\r]/.test(value)) {
    return `"${value}"`;
  }

  return value;
}

export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  const lines = rows.map((row) =>
    row
      .map((cell) => {
        if (cell === null || cell === undefined) {
          return "";
        }
        return csvEscape(String(cell));
      })
      .join(","),
  );

  // Use CRLF for Excel compatibility, and prefix a UTF-8 BOM for non-ASCII names.
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

