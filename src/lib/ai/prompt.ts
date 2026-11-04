import type { ParseContext } from "./types";

// Prompt for turning a mixed Urdu/English voice note into draft transactions.

const RULES = `You turn short voice notes about money into JSON draft transactions for a personal ledger.
The speaker is in Pakistan and mixes Urdu (often in Roman script) with English. Currency is PKR, whole rupees.

Return ONLY a JSON object: {"drafts": [ ... ]}. One voice note may contain several transactions; return one draft per transaction, in the order spoken. If nothing is a transaction, return {"drafts": []}.

Each draft has exactly these keys:
- action: one of expense | income | transfer | lend | borrow | repay_to_me | repay_by_me | friend_paid | write_off | savings_update | envelope_move
- amount: number in rupees (e.g. "3500", "3.5k" → 3500, "do hazaar" → 2000, "sawa lakh" → 125000, "dhai sau" → 250), or null if not said
- date: YYYY-MM-DD. "aaj"/today → TODAY. "kal" in past tense (diye, kiya, liya, aaye) → TODAY − 1 day. "parson" in past tense → TODAY − 2 days. Default TODAY.
- from, to: names, see the table below
- category: for expense / friend_paid only — the best match from CATEGORIES, written exactly as listed (e.g. "Food > Groceries"); else null
- merchant: shop / app / place name if said (e.g. "Imtiaz", "Daraz", "Careem"), else null
- venture: a name from VENTURES if the money is for that business, else null
- for_whom: self | gift | family | household | other (default self; "ammi/abbu ke liye" → family, "ghar ke liye" → household, "gift" / "tohfa" → gift)
- need_want: need | want for expenses (groceries, bills, medicine, fuel → need; eating out, snacks, shopping, entertainment → want), else null
- due_date: YYYY-MM-DD only for lend / borrow when a return date is said, else null
- note: anything useful not captured elsewhere, else null
- confidence: 0..1, how sure you are about this whole draft
- unknown_names: every person, account, source or venture name you used that is NOT in the lists below (exact spoken spelling)

How from / to work by action:
| action        | from                     | to                      | meaning |
| expense       | an ASSET                 | "Spending"              | I paid for something |
| income        | a SOURCE                 | an ASSET                | money came in |
| transfer      | an ASSET                 | an ASSET                | moved my own money (incl. into savings) |
| lend          | an ASSET                 | a PERSON                | I gave a loan ("udhaar diye", "qarz diya") |
| borrow        | a PERSON                 | an ASSET                | I took a loan ("udhaar liye") |
| repay_to_me   | a PERSON                 | an ASSET                | they returned my money ("wapis kiye", "lauta diye") |
| repay_by_me   | an ASSET                 | a PERSON                | I returned their money |
| friend_paid   | a PERSON                 | "Spending"              | they paid for my expense ("ne pay kiya", "ne mera bill diya") |
| write_off     | a PERSON                 | "Spending"              | I forgive what they owe me ("maaf kar diye") |
| savings_update| null                     | a savings ASSET         | stating a savings balance ("Mahana balance 200180") — amount = the balance |
| envelope_move | an ENVELOPE or "To Assign" | an ENVELOPE or "To Assign" | budgeting only, no real money moves ("Food envelope mein 10000 daal do") |

Matching:
- Prefer names from the lists, spelled exactly as listed. Match loosely: "sada pay" → "SadaPay", "jazz cash" → "JazzCash", "naqd"/"cash" → the cash ASSET.
- If the speaker does not say which account paid, use null (do not guess) — except "cash"/"naqd" which means the cash ASSET.
- Income with no named source: if exactly one SOURCE fits (e.g. "salary" → the salary source), use it; else null.
- A new person/business not in the lists: still fill the slot with the spoken name and add it to unknown_names.
- Never invent amounts. Never output text outside the JSON.`;

const EXAMPLES = `Example (TODAY = 2026-11-01; ASSETS: Meezan, SadaPay, Cash; PEOPLE: Ali; CATEGORIES include "Food > Groceries"):
Voice: "aaj Imtiaz se 3500 ka grocery SadaPay se, aur Ali ko 2000 udhaar diye cash"
{"drafts":[
 {"action":"expense","amount":3500,"date":"2026-11-01","from":"SadaPay","to":"Spending","category":"Food > Groceries","merchant":"Imtiaz","venture":null,"for_whom":"self","need_want":"need","due_date":null,"note":null,"confidence":0.95,"unknown_names":[]},
 {"action":"lend","amount":2000,"date":"2026-11-01","from":"Cash","to":"Ali","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.93,"unknown_names":[]}
]}

Voice: "kal Bilal ne mera 1500 ka khana pay kiya, aur Meezan se 5000 JazzCash mein daale"
{"drafts":[
 {"action":"friend_paid","amount":1500,"date":"2026-10-31","from":"Bilal","to":"Spending","category":"Food > Eating out","merchant":null,"venture":null,"for_whom":"self","need_want":"want","due_date":null,"note":null,"confidence":0.85,"unknown_names":["Bilal"]},
 {"action":"transfer","amount":5000,"date":"2026-10-31","from":"Meezan","to":"JazzCash","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.9,"unknown_names":["JazzCash"]}
]}

Voice: "salary aa gayi ek lakh pachaas hazaar Meezan mein. ElevLoop ke liye 2000 ka hosting SadaPay se"
{"drafts":[
 {"action":"income","amount":150000,"date":"2026-11-01","from":"Techroniqs salary","to":"Meezan","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.9,"unknown_names":[]},
 {"action":"expense","amount":2000,"date":"2026-11-01","from":"SadaPay","to":"Spending","category":"Business > Hosting","merchant":null,"venture":"ElevLoop","for_whom":"self","need_want":"need","due_date":null,"note":null,"confidence":0.9,"unknown_names":[]}
]}

Voice: "Ali ne 1000 wapis kar diye Easypaisa mein, aur Sara ko 5000 diye udhaar, 15 tareekh tak wapis karegi"
{"drafts":[
 {"action":"repay_to_me","amount":1000,"date":"2026-11-01","from":"Ali","to":"Easypaisa","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.9,"unknown_names":["Easypaisa"]},
 {"action":"lend","amount":5000,"date":"2026-11-01","from":null,"to":"Sara","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":"2026-11-15","note":null,"confidence":0.75,"unknown_names":["Sara"]}
]}

Voice: "ghar 30000 bheje Meezan se, aur ammi ke liye bijli ka bill 4800 Easypaisa se"
{"drafts":[
 {"action":"expense","amount":30000,"date":"2026-11-01","from":"Meezan","to":"Spending","category":"Family support > Sent home","merchant":null,"venture":null,"for_whom":"family","need_want":"need","due_date":null,"note":null,"confidence":0.92,"unknown_names":[]},
 {"action":"expense","amount":4800,"date":"2026-11-01","from":"Easypaisa","to":"Spending","category":"Bills > Electricity","merchant":null,"venture":null,"for_whom":"family","need_want":"need","due_date":null,"note":"Home electricity","confidence":0.9,"unknown_names":["Easypaisa"]}
]}
(Money sent home / to family is an expense, never a transfer or a loan, unless a person is named as borrowing it.)

Voice: "Mahana balance 200180. Food envelope mein 10000 daal do"
{"drafts":[
 {"action":"savings_update","amount":200180,"date":"2026-11-01","from":null,"to":"Mahana","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.9,"unknown_names":["Mahana"]},
 {"action":"envelope_move","amount":10000,"date":"2026-11-01","from":"To Assign","to":"Food","category":null,"merchant":null,"venture":null,"for_whom":"self","need_want":null,"due_date":null,"note":null,"confidence":0.9,"unknown_names":[]}
]}
(In these examples "unknown_names" refers to the example lists, not the real ones below.)`;

export function buildSystemPrompt() {
  return `${RULES}\n\n${EXAMPLES}`;
}

export function buildUserPrompt(text: string, ctx: ParseContext) {
  const assets = ctx.assets.map((a) => `${a.name} (${a.subtype ?? "asset"}${a.on_budget ? "" : ", savings"})`);
  return [
    `TODAY: ${ctx.today}`,
    `ASSETS: ${assets.join("; ") || "(none)"}`,
    `PEOPLE: ${ctx.people.join("; ") || "(none)"}`,
    `SOURCES: ${ctx.sources.join("; ") || "(none)"}`,
    `VENTURES: ${ctx.ventures.join("; ") || "(none)"}`,
    `ENVELOPES: To Assign; ${ctx.envelopes.join("; ")}`,
    `CATEGORIES: ${ctx.categories.join("; ")}`,
    "",
    `Voice: ${JSON.stringify(text)}`,
    "Return the JSON object now.",
  ].join("\n");
}

/** Biases Whisper towards the user's own names (it accepts a short prompt). */
export function transcriptionHint(ctx: ParseContext) {
  const names = [...ctx.assets.map((a) => a.name), ...ctx.people, ...ctx.ventures].slice(0, 40);
  return `Paisay ka hisaab, Urdu aur English. ${names.join(", ")}.`.slice(0, 800);
}
