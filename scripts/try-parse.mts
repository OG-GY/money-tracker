// Live check of the voice parser against the real providers (needs GEMINI_API_KEY / GROQ_API_KEY).
//   npm run try:parse
//   npm run try:parse -- "kal 500 ka petrol cash se"
import { parseTransactions } from "../src/lib/ai";
import type { ParseContext } from "../src/lib/ai/types";

// SPEC Â§11 seed data stands in for the user's real accounts.
const context: ParseContext = {
  today: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()),
  assets: [
    { name: "Meezan", subtype: "bank", on_budget: true },
    { name: "SadaPay", subtype: "wallet", on_budget: true },
    { name: "Easypaisa", subtype: "wallet", on_budget: true },
    { name: "JazzCash", subtype: "wallet", on_budget: true },
    { name: "Cash", subtype: "cash", on_budget: true },
    { name: "Mahana", subtype: "savings", on_budget: false },
  ],
  people: ["Ali"],
  sources: ["Techroniqs salary", "SnapDev AI", "Mahana Profit", "Gift received"],
  categories: [
    "Food > Daily meals", "Food > Snacks", "Food > Eating out", "Food > Groceries",
    "Transport > Fuel", "Transport > Ride-hailing", "Bills > Mobile", "Bills > Internet",
    "Business > Ads", "Business > Hosting", "Shopping > Clothes", "Health > Medicine",
  ],
  envelopes: ["Food", "Transport", "Bills", "Shopping", "Savings goal", "Fun"],
  ventures: ["ElevLoop", "Make Pakistan Digital", "Electronics store"],
};

const text = process.argv[2] ?? "aaj Imtiaz se 3500 ka grocery SadaPay se, aur Ali ko 2000 udhaar diye cash";

const started = Date.now();
const { drafts, provider } = await parseTransactions(text, context);
console.log(`"${text}"\nâ†’ ${drafts.length} draft(s) via ${provider} in ${Date.now() - started}ms\n`);
console.log(JSON.stringify(drafts, null, 2));

if (!process.argv[2]) {
  const [a, b] = drafts;
  const ok =
    drafts.length === 2 &&
    a.action === "expense" && a.amount === 3500 && a.from === "SadaPay" && a.category === "Food > Groceries" &&
    b.action === "lend" && b.amount === 2000 && b.from === "Cash" && b.to === "Ali";
  console.log(ok ? "\nPASS: Phase 4 done-when sentence â†’ two correct drafts" : "\nFAIL: drafts don't match the expected pair");
  process.exit(ok ? 0 : 1);
}
