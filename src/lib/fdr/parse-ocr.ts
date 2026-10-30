/** What OCR found on a document. Dates are YYYY-MM-DD and the amount is a plain decimal string. */
export type ExtractedFields = {
  fdrNumber: string | null;
  bankName: string | null;
  branchName: string | null;
  ifscCode: string | null;
  amount: string | null;
  issueDate: string | null;
  maturityDate: string | null;
};

export const KNOWN_BANKS = [
  "State Bank of India",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Indian Bank",
  "Central Bank of India",
  "Indian Overseas Bank",
  "UCO Bank",
  "Bank of Maharashtra",
  "Punjab & Sind Bank",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "IDBI Bank",
  "Yes Bank",
  "IndusInd Bank",
  "Federal Bank",
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_PATTERN = "(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[ -][A-Za-z]{3,9}[ -,]+\\d{4})";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid && year >= 1990 && year <= 2100 ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** Indian receipts are day first, so 03/04/2026 is 3 April. */
export function parseDate(raw: string): string | null {
  const text = raw.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return toIsoDate(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{1,2})[ -]([A-Za-z]{3,9})[ -,]+(\d{4})$/.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
    return month >= 0 ? toIsoDate(Number(match[3]), month + 1, Number(match[1])) : null;
  }
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function findDate(text: string, labels: string): string | null {
  const pattern = new RegExp(`(?:${labels})[^\\n\\d]{0,20}${DATE_PATTERN}`, "i");
  const match = pattern.exec(text);
  return match ? parseDate(match[1]) : null;
}

function parseAmount(raw: string | null): string | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? String(value) : null;
}

function findBank(text: string): string | null {
  const lower = text.toLowerCase();
  // Longest first, so "Central Bank of India" isn't reported as "Bank of India".
  const known = [...KNOWN_BANKS]
    .sort((a, b) => b.length - a.length)
    .find((bank) => lower.includes(bank.toLowerCase()));
  if (known) return known;
  return firstMatch(text, [/^\s*([A-Za-z][A-Za-z&. ]{2,60}\sBank(?:\sLtd\.?|\sLimited)?)\s*$/im]);
}

export function parseFdrText(text: string): ExtractedFields {
  return {
    fdrNumber: firstMatch(text, [
      /(?:FDR|FD|Fixed Deposit|Receipt|Deposit|TDR)\s*(?:Receipt\s*)?(?:No\.?|Number|#)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9/-]{3,39})/i,
      /(?:Account|A\/c)\s*(?:No\.?|Number)\s*[:\-.]?\s*([A-Z0-9][A-Z0-9/-]{3,39})/i,
    ]),
    bankName: findBank(text),
    branchName: firstMatch(text, [/Branch(?:\s*Name)?\s*[:\-]\s*([^\n]{2,120})/i]),
    ifscCode: firstMatch(text, [/\b([A-Z]{4}0[A-Z0-9]{6})\b/])?.toUpperCase() ?? null,
    // Principal first: a receipt usually also prints a larger maturity value.
    amount: parseAmount(
      firstMatch(text, [
        /(?:Principal|Deposit Amount|Amount of Deposit|FD Amount|FDR Amount)[^\n\d]{0,20}([\d,]+(?:\.\d{1,2})?)/i,
        /(?<!Maturity )(?<!Maturity Value )Amount[^\n\d]{0,20}([\d,]+(?:\.\d{1,2})?)/i,
        /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
      ]),
    ),
    issueDate: findDate(text, "Date of Issue|Issue Date|Date of Deposit|Deposit Date|Issued on|Value Date|Start Date"),
    maturityDate: findDate(text, "Maturity Date|Date of Maturity|Due Date|Matures on"),
  };
}
