"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Row } from "./compute";

const PAGE = 1000; // PostgREST's default max rows per request
const COLUMNS =
  "id, occurred_on, amount, tx_type, from_account_id, to_account_id, category_id, for_whom, need_want, merchant, venture_id, loan_action";

/**
 * The whole ledger, slim columns, paged past the 1000-row cap. Single-user
 * volumes are small; every chart then aggregates the same slice locally.
 */
export function useLedgerRows() {
  return useQuery({
    queryKey: ["ledger", "analytics-rows"],
    staleTime: 60_000,
    queryFn: async () => {
      const db = createClient();
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("transactions_typed")
          .select(COLUMNS)
          .order("occurred_on")
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...(data as Row[]).map((r) => ({ ...r, amount: Number(r.amount) })));
        if (!data || data.length < PAGE) break;
      }
      return out;
    },
  });
}
