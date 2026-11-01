import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  Scale,
  Flag,
  HandCoins,
  HandHeart,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { LoanAction, TypedTransaction } from "@/lib/db/types";
import type { useLedgerModel } from "@/lib/ledger/model";

type Model = ReturnType<typeof useLedgerModel>;

export type TxDisplay = {
  title: string;
  subtitle: string;
  category: string | null;
  icon: LucideIcon;
  /** +1 money in, −1 money out, 0 neutral (transfers, loans). */
  sign: 1 | -1 | 0;
};

const LOAN_TEXT: Record<LoanAction, (person: string) => string> = {
  lend: (p) => `Lent to ${p}`,
  borrow: (p) => `Borrowed from ${p}`,
  repay_to_me: (p) => `${p} repaid me`,
  repay_by_me: (p) => `Repaid ${p}`,
  friend_paid: (p) => `${p} paid for me`,
  write_off: (p) => `Wrote off ${p}'s loan`,
};

const LOAN_ICON: Record<LoanAction, LucideIcon> = {
  lend: HandCoins,
  borrow: HandCoins,
  repay_to_me: Undo2,
  repay_by_me: Undo2,
  friend_paid: HandHeart,
  write_off: Ban,
};

export function describeTx(tx: TypedTransaction, m: Model): TxDisplay {
  const from = m.accountById.get(tx.from_account_id)?.name ?? "?";
  const to = m.accountById.get(tx.to_account_id)?.name ?? "?";
  const category = m.categoryLabel(tx.category_id);
  const venture = tx.venture_id ? m.ventureById.get(tx.venture_id)?.name : null;

  if (tx.loan_action) {
    const personIsFrom = m.accountById.get(tx.from_account_id)?.kind === "person";
    const person = personIsFrom ? from : to;
    const asset = personIsFrom ? to : from;
    const other = tx.loan_action === "friend_paid" ? category : tx.loan_action === "write_off" ? null : asset;
    return {
      title: LOAN_TEXT[tx.loan_action](person),
      subtitle: [other, tx.due_date && `due ${tx.due_date}`].filter(Boolean).join(" · ") || "Loan",
      category,
      icon: LOAN_ICON[tx.loan_action],
      // Friend-paid is my spending; the rest only move money between me and them.
      sign: tx.loan_action === "friend_paid" ? -1 : 0,
    };
  }

  switch (tx.tx_type) {
    case "expense":
      return {
        title: tx.merchant || category || "Expense",
        subtitle: [tx.merchant ? category : null, from, venture].filter(Boolean).join(" · "),
        category,
        icon: ArrowUpRight,
        sign: -1,
      };
    case "income":
      return {
        title: from,
        subtitle: [`Into ${to}`, venture].filter(Boolean).join(" · "),
        category: null,
        icon: ArrowDownLeft,
        sign: 1,
      };
    case "adjustment": {
      const acc = m.accountById.get(tx.from_account_id)?.kind === "asset" ? from : to;
      const up = m.accountById.get(tx.to_account_id)?.kind === "asset";
      return { title: "Balance correction", subtitle: acc, category: null, icon: Scale, sign: up ? 1 : -1 };
    }
    case "opening":
      return { title: "Opening balance", subtitle: to, category: null, icon: Flag, sign: 0 };
    case "transfer":
      return { title: `${from} → ${to}`, subtitle: "Transfer", category: null, icon: ArrowLeftRight, sign: 0 };
    default:
      return { title: `${from} → ${to}`, subtitle: "Loan", category: null, icon: HandCoins, sign: 0 };
  }
}
