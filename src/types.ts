/**
 * Response types for the Trakteer endpoints used by these utils.
 *
 * Ported from Trakteer.js v2.3.4 (https://github.com/BbayuGt/Trakteer.js).
 * Only the Public API, User API and Payment API shapes are kept; the Stream
 * API types were dropped. The Midtrans charge response type was dropped too,
 * because Trakteer now answers with a hosted checkout URL instead.
 */

export interface PaginationMeta {
  include: Array<string>;
  pagination: {
    count: number;
    current_page: number;
    links: {
      next?: string;
      previous?: string;
    };
    per_page: number;
    total: number;
    total_page: number;
  };
}

export interface SupportHistory {
  error_code?: string;
  errors?: Record<string, unknown>;
  message: string;
  result: {
    data: Array<{
      supporter_name: string;
      support_message: string;
      quantity: number;
      amount: number;
      unit_name: string;
      updated_at: string;
    }>;
    meta: PaginationMeta;
  } | null;
  status: "success" | "error";
  status_code: number;
}

export interface TransactionHistory {
  message: string;
  result: {
    data: Array<{
      creator_name: string;
      support_message: string;
      quantity: number;
      amount: number;
      unit_name: string;
      status: string;
      updated_at: string;
      payment_method: string;
      order_id: string;
    }>;
    meta: PaginationMeta;
  };
  status: "success" | "error";
  status_code: number;
}

export type PaymentGateway = "midtrans" | "xendit" | "trakteer" | "ipay" | null;

export interface PaymentMethod {
  description: string;
  fee?: number;
  fee_percent?: number;
  gateway: PaymentGateway;
  group_label: string;
  group_order: number;
  has_exclusive_payment_fee: boolean;
  icon: string;
  icon_mobile: string;
  ipay_fee?: Record<string, string>;
  label: string;
  login_required: boolean;
  max_price: number | null;
  message: string;
  method: string;
  min_price: number | null;
  ppn?: number;
  promo: string;
  status: "available" | "disabled";
}

export interface PaymentTotal {
  booster_items?: Array<unknown>;
  extra_platform_fee?: number;
  has_booster?: boolean;
  is_payment_fee_by_supporter: boolean;
  payment_fee: number;
  payment_method: string;
  platform_fee_info?: unknown;
  platform_fee_share?: number;
  platform_fee_total?: number;
  price: number;
  // Fields returned by the live API but missing from Trakteer.js v2.3.4.
  supporter_platform_fee?: number;
  total_price: number;
  transfer_fee: number;
  transfer_fee_info?: unknown;
}

export interface CreatePaymentConfig {
  /** Jenius cashtag. */
  cashtag?: string;
  display_name?: string;
  guest_email?: string;
  is_anonym?: boolean;
  is_private?: boolean;
  is_showing_email?: boolean;
  /** Must start with "08", not "+62" (LinkAja only). */
  linkaja_phone?: `08${string}`;
  /** Must start with "08", not "+62" (OVO only). */
  ovo_phone?: `08${string}`;
  support_message?: string;
}

export interface ActiveUnit {
  icon: string;
  id: string;
  name: string;
  /** Price per unit, in rupiah, serialized as a string. */
  price: string;
}

export interface PageStatus {
  is_page_active: boolean;
  is_restricted: boolean;
  is_support_enabled: boolean;
  is_suspended: boolean;
  is_under_review: boolean;
}

export interface StreamSettings {
  active_max_duration: boolean;
  allow_audio: boolean;
  allow_gif: boolean;
  allow_tts: boolean;
  allow_video: boolean;
  allow_voice: boolean;
  delay: string;
  level_name: string;
  tier_level: string;
  tts_max_duration: number;
  video_duration: number;
  video_max_duration: number;
}

export interface UserGoal {
  description: string;
  /** Serialized float, e.g. "0.5". */
  progress: string;
  /** Serialized float, e.g. "10000.0". */
  target_price: string;
  title: string;
  /** Serialized float, e.g. "5000.0". */
  total_received: string;
}

export interface UserSummary {
  active_goal?: {
    data: UserGoal;
  };
  active_unit: {
    data: ActiveUnit;
  };
  avatar: string;
  category: string;
  cover_image: string;
  follower_count: string;
  id: string;
  is_following: boolean;
  is_live: boolean;
  occupation: string;
  /** Page slug, without the trakteer.id/ prefix. */
  page: string;
  page_status: PageStatus;
  socials: Record<string, string>;
  stream_settings: Record<string, StreamSettings>;
  summary: string;
  username: string;
  video_url: string | null;
}
