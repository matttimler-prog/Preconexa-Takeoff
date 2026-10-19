export type StampDef = { id: string; text: string; color: string; date?: boolean };

export const STAMPS: StampDef[] = [
  { id: "approved", text: "Approved", color: "#16a34a" }, { id: "asnoted", text: "Approved as noted", color: "#16a34a" },
  { id: "rejected", text: "Rejected", color: "#dc2626" }, { id: "revise", text: "Revise and resubmit", color: "#d97706" },
  { id: "reviewed", text: "Reviewed", color: "#2563eb" }, { id: "draft", text: "Draft", color: "#64748b" },
  { id: "prelim", text: "Preliminary", color: "#d97706" }, { id: "void", text: "Void", color: "#dc2626" },
  { id: "conf", text: "Confidential", color: "#dc2626" }, { id: "cons", text: "For construction", color: "#16a34a" },
  { id: "notcons", text: "Not for construction", color: "#dc2626" }, { id: "asbuilt", text: "As built", color: "#2563eb" },
  { id: "bid", text: "Issued for bid", color: "#7c3aed" }, { id: "super", text: "Superseded", color: "#64748b" },
  { id: "complete", text: "Complete", color: "#16a34a" }, { id: "date", text: "Date", color: "#2563eb", date: true },
];
export const CUSTOM_STAMP = "custom";

const two = (n: number) => String(n).padStart(2, "0");
/** Text printed on the stamp; dated stamps get today's date on a second line. */
export function stampText(d: StampDef, now: Date = new Date()): string {
  const date = `${two(now.getMonth() + 1)}/${two(now.getDate())}/${now.getFullYear()}`;
  return d.date ? date : d.text;
}
export function stampWithDate(text: string, now: Date = new Date()): string {
  return `${text}\n${two(now.getMonth() + 1)}/${two(now.getDate())}/${now.getFullYear()}`;
}
