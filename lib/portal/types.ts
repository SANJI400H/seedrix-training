export type Role = "owner" | "admin" | "sales";

export type Staff = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type Settings = {
  sales_pct: number;
  vat_enabled: boolean;
  vat_rate: number;
  company_phone: string;
  company_email: string;
  round_robin_enabled: boolean;
  round_robin_staff_ids: string[];
  notify_new_leads: boolean;
  company_name: string;
  trade_name: string;
  address: string;
  license_no: string;
  bank_name: string;
  iban: string;
  trn: string;
  invoice_footer: string;
};

/** Safe teacher fields every staff member may see (public.teachers_public). */
export type TeacherPublic = {
  id: string;
  name: string;
  nationality: string | null;
  languages: string | null;
  subjects: string | null;
  curricula: string | null;
  grade_range: string | null;
  emirate: string | null;
  areas: string | null;
  delivery_modes: string | null;
  availability: string | null;
  bio: string | null;
  status: "active" | "onboarding" | "inactive";
  active: boolean;
  photo_path: string | null;
};

/** Full teacher row (owner/admin only). */
export type Teacher = TeacherPublic & {
  phone: string | null;
  email: string | null;
  rate_aed: number | null;
  rate_note: string | null;
  pay_unit: "hour" | "class" | "course" | null;
  bank_name: string | null;
  iban: string | null;
  rating: number | null;
  notes: string | null;
};

export const TEACHER_STATUSES = ["active", "onboarding", "inactive"] as const;
export const CURRICULA = ["american", "british", "ministry", "ib", "indian", "other"] as const;
export type Curriculum = (typeof CURRICULA)[number];
export const CURRICULUM_LABEL: Record<Curriculum, string> = {
  american: "American",
  british: "British",
  ministry: "Ministry (UAE)",
  ib: "IB",
  indian: "Indian",
  other: "Other",
};
export const DELIVERY_MODES = ["home", "online", "centre"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export const DELIVERY_LABEL: Record<DeliveryMode, string> = { home: "At home", online: "Online", centre: "At the centre" };

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  whatsapp: string | null;
  email: string | null;
  emirate: string | null;
  area: string | null;
  address: string | null;
  preferred_language: string | null;
  source: string | null;
  lead_id: string | null;
  rep_id: string | null;
  notes: string | null;
  created_at: string;
};

export { LEAD_SOURCES, SOURCE_LABEL } from "@/lib/leads/source";
import type { LeadSource } from "@/lib/leads/source";
export type { LeadSource };

export const LEAD_STAGES = ["new", "contacted", "trial_booked", "trial_done", "enrolled", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  trial_booked: "Trial booked",
  trial_done: "Trial done",
  enrolled: "Enrolled",
  lost: "Lost",
};


export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  emirate: string | null;
  interest: string | null;
  child_grades: string | null;
  stage: LeadStage;
  assigned_rep_id: string | null;
  next_follow_up: string | null;
  lost_reason: string | null;
  inquiry_id: string | null;
  first_contact_on: string | null;
  campaign: string | null;
  ad_set: string | null;
  ad_name: string | null;
  form_name: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  received_at: string;
  last_inbound_at: string;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadNote = {
  id: string;
  lead_id: string;
  body: string;
  kind: "note" | "stage" | "import" | "system";
  created_at: string;
  created_by: string | null;
};

export const STUDENT_STATUSES = ["active", "paused", "finished", "cancelled", "archived"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export type Student = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  grade: string | null;
  school: string | null;
  curriculum: Curriculum | null;
  subjects: string | null;
  delivery_mode: DeliveryMode | null;
  name: string;
  phone: string | null;
  payer_name: string | null;
  rep_id: string | null;
  teacher_id: string | null;
  course: string | null;
  agreed_fee: number;
  schedule: string | null;
  start_date: string | null;
  next_payment_amount: number | null;
  next_payment_date: string | null;
  status: StudentStatus;
  notes: string | null;
  created_at: string;
};

export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "staff"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer to Wio",
  card: "Card / payment link",
  cash: "Cash",
  staff: "Paid to a staff member",
};
/** Money that did not go straight into the company account. */
export const OUTSIDE_ACCOUNT: PaymentMethod[] = ["cash", "staff"];

export type ClientPayment = {
  id: string;
  paid_on: string;
  student_id: string;
  amount: number;
  method: PaymentMethod;
  received_by_staff_id: string | null;
  payer_name: string | null;
  bank_ref: string | null;
  rep_id: string | null;
  teacher_share: number;
  sales_pct: number;
  commission: number;
  academy: number;
  invoice_id: string | null;
  note: string | null;
  duplicate_confirmed: boolean;
  overpay_confirmed: boolean;
  void: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export const PAYOUT_TYPES = ["teacher", "commission", "refund", "other"] as const;
export type PayoutType = (typeof PAYOUT_TYPES)[number];
export const PAYOUT_LABEL: Record<PayoutType, string> = {
  teacher: "Teacher pay",
  commission: "Commission",
  refund: "Client refund",
  other: "Other",
};

export type Payout = {
  id: string;
  paid_on: string;
  type: PayoutType;
  payee: string;
  teacher_id: string | null;
  staff_id: string | null;
  amount: number;
  client_payment_id: string | null;
  method: PaymentMethod;
  note: string | null;
  overpay_confirmed: boolean;
  void: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

export type BankLine = {
  id: string;
  booked_on: string;
  ref: string;
  txn_type: string | null;
  description: string | null;
  amount: number;
  balance: number | null;
  original_ref: string | null;
  notes: string | null;
  ignored: boolean;
  ignored_reason: string | null;
};

export type BankMatch = {
  id: string;
  bank_line_id: string | null;
  manual_date: string | null;
  manual_amount: number | null;
  manual_ref: string | null;
  client_payment_id: string | null;
  payout_id: string | null;
  matched_amount: number;
  matched_by: string | null;
  matched_at: string;
  unmatched_at: string | null;
  unmatched_by: string | null;
  unmatch_reason: string | null;
};

export type AuditEntry = {
  id: number;
  at: string;
  actor: string | null;
  actor_role: string | null;
  action: "insert" | "update" | "delete";
  table_name: string;
  row_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  kind: "receipt" | "bill" | null;
  student_id: string | null;
  client_id: string | null;
  amount_paid: number;
  vat_rate: number;
  due_date: string | null;
  issued_by: string | null;
  locale: string;
  service: string;
  description: string | null;
  amount_aed: number;
  vat_aed: number;
  total_aed: number;
  client_name: string;
  client_mobile: string;
  client_email: string | null;
  recruit_name: string | null;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  created_at: string;
};
