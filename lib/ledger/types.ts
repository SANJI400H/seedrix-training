/** Minimal shapes the pure ledger functions work on (subset of DB rows). */

export type PaymentLike = {
  id: string;
  student_id: string;
  paid_on: string; // YYYY-MM-DD
  amount: number;
  teacher_share: number;
  commission: number;
  academy: number;
  method: string;
  void: boolean;
  payer_name?: string | null;
  rep_id?: string | null;
};

export type PayoutType = "teacher" | "commission" | "refund" | "other";

export type PayoutLike = {
  id: string;
  paid_on: string;
  type: PayoutType;
  amount: number;
  client_payment_id: string | null;
  void: boolean;
  payee?: string | null;
  teacher_id?: string | null;
  staff_id?: string | null;
};

export type StudentLike = {
  id: string;
  name: string;
  agreed_fee: number;
  next_payment_date?: string | null;
  status?: string;
};

export type MatchLike = {
  id: string;
  client_payment_id: string | null;
  payout_id: string | null;
  bank_line_id: string | null;
  matched_amount: number;
  unmatched_at: string | null;
};

export type BankLineLike = {
  id: string;
  booked_on: string;
  ref: string;
  description: string | null;
  amount: number; // + in, − out
  txn_type?: string | null;
  ignored?: boolean;
};
