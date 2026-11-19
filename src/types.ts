/**
 * Response types for the Trakteer endpoints used by these utils.
 *
 * Ported from Trakteer.js v2.3.4 (https://github.com/BbayuGt/Trakteer.js).
 * Only the Public API, User API and Payment API shapes are kept; the Stream
 * API types were dropped. The Midtrans charge response type was dropped too,
 * because Trakteer now answers with a hosted checkout URL instead.
 *
 * @module
 */

/** Pagination metadata attached to list responses. */
export interface PaginationMeta {
  /** Relationships included in the response, as requested by the API. */
  include: Array<string>;
  pagination: {
    /** Number of items in the current page. */
    count: number;
    /** 1-based index of the current page. */
    current_page: number;
    /** URLs of the adjacent pages, when they exist. */
    links: {
      next?: string;
      previous?: string;
    };
    /** Maximum number of items per page. */
    per_page: number;
    /** Total number of items across all pages. */
    total: number;
    /** Total number of pages. */
    total_page: number;
  };
}

/** Response from the Public API `/supports` endpoint. */
export interface SupportHistory {
  /** Machine-readable error code, set when `status` is `"error"`. */
  error_code?: string;
  /** Field-level validation errors, set when `status` is `"error"`. */
  errors?: Record<string, unknown>;
  /** Human-readable message from Trakteer. */
  message: string;
  /** The support entries, or `null` when the account has none. */
  result: {
    data: Array<{
      /** Display name of the supporter. */
      supporter_name: string;
      /** Message attached to the support. */
      support_message: string;
      /** Number of units given. */
      quantity: number;
      /** Amount charged for the support. */
      amount: number;
      /** Name of the unit that was supported. */
      unit_name: string;
      /** ISO 8601 timestamp of the last update. */
      updated_at: string;
    }>;
    meta: PaginationMeta;
  } | null;
  /** Request outcome as reported by Trakteer. */
  status: "success" | "error";
  /** HTTP status code. */
  status_code: number;
}

/** Response from the Public API `/transactions` endpoint. */
export interface TransactionHistory {
  /** Human-readable message from Trakteer. */
  message: string;
  result: {
    data: Array<{
      /** Display name of the creator who received the support. */
      creator_name: string;
      /** Message attached to the support. */
      support_message: string;
      /** Number of units given. */
      quantity: number;
      /** Amount charged for the support. */
      amount: number;
      /** Name of the unit that was supported. */
      unit_name: string;
      /** Transaction status reported by Trakteer. */
      status: string;
      /** ISO 8601 timestamp of the last update. */
      updated_at: string;
      /** Payment method used for the transaction. */
      payment_method: string;
      /** Trakteer order id. */
      order_id: string;
    }>;
    meta: PaginationMeta;
  };
  /** Request outcome as reported by Trakteer. */
  status: "success" | "error";
  /** HTTP status code. */
  status_code: number;
}

/** Payment gateway that processes a method, or `null` when none is involved. */
export type PaymentGateway = "midtrans" | "xendit" | "trakteer" | "ipay" | null;

/** A payment method returned by the Payment API. */
export interface PaymentMethod {
  /** Description shown on the checkout page. */
  description: string;
  /** Flat fee, when the method charges one. */
  fee?: number;
  /** Fee as a percentage of the amount, when the method charges one. */
  fee_percent?: number;
  /** Gateway that processes this method. */
  gateway: PaymentGateway;
  /** Label of the group this method is shown under. */
  group_label: string;
  /** Sort order of the group. */
  group_order: number;
  /** Whether the method charges its own payment fee. */
  has_exclusive_payment_fee: boolean;
  /** Icon URL for desktop layouts. */
  icon: string;
  /** Icon URL for mobile layouts. */
  icon_mobile: string;
  /** iPay fee details, for methods settled through iPay. */
  ipay_fee?: Record<string, string>;
  /** Display name of the method. */
  label: string;
  /** Whether paying with this method requires a Trakteer login. */
  login_required: boolean;
  /** Maximum amount in rupiah, or `null` when unbounded. */
  max_price: number | null;
  /** Message shown by Trakteer for this method. */
  message: string;
  /** Method id, e.g. `"qris"`. */
  method: string;
  /** Minimum amount in rupiah, or `null` when unbounded. */
  min_price: number | null;
  /** Tax rate, when the method reports one. */
  ppn?: number;
  /** Promo label, if any. */
  promo: string;
  /** Whether the method can currently be selected. */
  status: "available" | "disabled";
}

/** Price breakdown returned by the Payment API for an amount and method. */
export interface PaymentTotal {
  /** Booster add-ons included in the total, if any. */
  booster_items?: Array<unknown>;
  /** Extra platform fee, when one applies. */
  extra_platform_fee?: number;
  /** Whether the order includes a booster. */
  has_booster?: boolean;
  /** Whether the payment fee is charged to the supporter. */
  is_payment_fee_by_supporter: boolean;
  /** Payment fee for the selected method. */
  payment_fee: number;
  /** Method id this breakdown was calculated for. */
  payment_method: string;
  /** Platform fee details, when reported. */
  platform_fee_info?: unknown;
  /** Share of the platform fee, when reported. */
  platform_fee_share?: number;
  /** Total platform fee, when reported. */
  platform_fee_total?: number;
  /** Base price before fees, in rupiah. */
  price: number;
  // Fields returned by the live API but missing from Trakteer.js v2.3.4.
  /** Platform fee charged to the supporter, when reported. */
  supporter_platform_fee?: number;
  /** Final amount to pay, including fees, in rupiah. */
  total_price: number;
  /** Transfer fee for the selected method, if any. */
  transfer_fee: number;
  /** Transfer fee details, when reported. */
  transfer_fee_info?: unknown;
}

/** Supporter details passed to {@link TrakteerPayment.createPayment}. */
export interface CreatePaymentConfig {
  /** Jenius cashtag. */
  cashtag?: string;
  /** Name shown next to the support. Defaults to `"Seseorang"`. */
  display_name?: string;
  /** Supporter email. Defaults to a placeholder address. */
  guest_email?: string;
  /** Hide the supporter's name on the creator page. */
  is_anonym?: boolean;
  /** Keep the support out of the public support list. */
  is_private?: boolean;
  /** Show the supporter's email on the creator page. */
  is_showing_email?: boolean;
  /** Must start with "08", not "+62" (LinkAja only). */
  linkaja_phone?: `08${string}`;
  /** Must start with "08", not "+62" (OVO only). */
  ovo_phone?: `08${string}`;
  /** Message shown on the creator page. Defaults to an empty string. */
  support_message?: string;
}

/** The unit a creator is currently accepting support in. */
export interface ActiveUnit {
  /** Icon URL of the unit. */
  icon: string;
  /** Unit id, used when creating a payment. */
  id: string;
  /** Display name of the unit. */
  name: string;
  /** Price per unit, in rupiah, serialized as a string. */
  price: string;
}

/** Public status flags of a creator page. */
export interface PageStatus {
  /** Whether the page is currently active. */
  is_page_active: boolean;
  /** Whether the page is restricted. */
  is_restricted: boolean;
  /** Whether the creator can currently receive support. */
  is_support_enabled: boolean;
  /** Whether the page is suspended. */
  is_suspended: boolean;
  /** Whether the page is under review. */
  is_under_review: boolean;
}

/** Stream settings for a creator page, keyed by level in {@link UserSummary.stream_settings}. */
export interface StreamSettings {
  /** Whether the maximum stream duration is enforced. */
  active_max_duration: boolean;
  /** Whether audio attachments are allowed. */
  allow_audio: boolean;
  /** Whether GIF attachments are allowed. */
  allow_gif: boolean;
  /** Whether text-to-speech is allowed. */
  allow_tts: boolean;
  /** Whether video attachments are allowed. */
  allow_video: boolean;
  /** Whether voice attachments are allowed. */
  allow_voice: boolean;
  /** Delay before stream messages are shown. */
  delay: string;
  /** Display name of the level. */
  level_name: string;
  /** Tier this configuration belongs to. */
  tier_level: string;
  /** Maximum text-to-speech duration, in seconds. */
  tts_max_duration: number;
  /** Default video duration, in seconds. */
  video_duration: number;
  /** Maximum video duration, in seconds. */
  video_max_duration: number;
}

/** Active funding goal of a creator page. */
export interface UserGoal {
  /** Goal description. */
  description: string;
  /** Serialized float, e.g. "0.5". */
  progress: string;
  /** Serialized float, e.g. "10000.0". */
  target_price: string;
  /** Goal title. */
  title: string;
  /** Serialized float, e.g. "5000.0". */
  total_received: string;
}

/** Creator summary returned by the web API. */
export interface UserSummary {
  /** Active funding goal, when the creator has one. */
  active_goal?: {
    data: UserGoal;
  };
  /** The unit the creator currently accepts support in. */
  active_unit: {
    data: ActiveUnit;
  };
  /** Avatar URL. */
  avatar: string;
  /** Creator category. */
  category: string;
  /** Cover image URL. */
  cover_image: string;
  /** Serialized follower count. */
  follower_count: string;
  /** Creator user id. */
  id: string;
  /** Whether the authenticated visitor follows this creator. */
  is_following: boolean;
  /** Whether the creator is currently live. */
  is_live: boolean;
  /** Creator occupation. */
  occupation: string;
  /** Page slug, without the trakteer.id/ prefix. */
  page: string;
  page_status: PageStatus;
  /** Social links, keyed by platform. */
  socials: Record<string, string>;
  /** Stream settings keyed by level. */
  stream_settings: Record<string, StreamSettings>;
  /** Short bio. */
  summary: string;
  /** Display name of the creator. */
  username: string;
  /** URL of the profile video, or `null` when absent. */
  video_url: string | null;
}
