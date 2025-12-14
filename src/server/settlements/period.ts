export function getMonthRangeUtc(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("INVALID_MONTH");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error("INVALID_MONTH");
  }

  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0, 0));
  // Day 0 of next month is the last day of the selected month.
  const endDate = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999));

  return { startDate, endDate };
}

