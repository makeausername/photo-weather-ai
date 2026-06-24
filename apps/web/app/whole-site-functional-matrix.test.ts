import { describe, expect, it } from "vitest";

type FunctionalArea =
  | "public_frontend"
  | "commercial_access"
  | "payment_subscription"
  | "admin"
  | "auth_captcha"
  | "history"
  | "cache_security";

type AuthExpectation = "public" | "optional_auth" | "required_auth" | "admin_auth" | "backend_gate";

type FunctionalMatrixEntry = {
  readonly id: string;
  readonly area: FunctionalArea;
  readonly auth: AuthExpectation;
  readonly expected: string;
  readonly coverage: string;
};

export const wholeSiteFunctionalRegressionMatrix = [
  {
    id: "homepage_location_search",
    area: "public_frontend",
    auth: "public",
    expected: "Search remains public and returns selectable real locations.",
    coverage: "place-search-card and homepage workbench tests",
  },
  {
    id: "homepage_guest_24h_general_forecast",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Guest users can request the basic 24h general forecast without a token.",
    coverage: "forecast-request-client.test.ts",
  },
  {
    id: "homepage_logged_in_full_access_forecast",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Logged-in trial, paid, and admin users send Authorization for forecast requests.",
    coverage: "forecast-request-client.test.ts",
  },
  {
    id: "forecast_general_result",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Deep-linked general forecast pages keep auth-aware calculation behavior.",
    coverage: "forecast-result-view-model.test.ts and forecast-request-client.test.ts",
  },
  {
    id: "cloud_sea_entry",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Cloud Sea entry uses the shared scenario flow and full-access backend gate.",
    coverage: "shared scenario page and forecast route tests",
  },
  {
    id: "glow_entry",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Glow entry uses the shared scenario flow and full-access backend gate.",
    coverage: "shared scenario page and forecast route tests",
  },
  {
    id: "astro_entry",
    area: "public_frontend",
    auth: "optional_auth",
    expected: "Astro entry uses the shared scenario flow and full-access backend gate.",
    coverage: "shared scenario page and forecast route tests",
  },
  {
    id: "pricing_page",
    area: "public_frontend",
    auth: "public",
    expected: "Pricing loads public billing products and guides logged-out checkout to login.",
    coverage: "pricing-client.test.ts",
  },
  {
    id: "login_page",
    area: "public_frontend",
    auth: "public",
    expected: "Login handles captcha-disabled and captcha-enabled states safely.",
    coverage: "auth-routes.test.ts and account-session tests",
  },
  {
    id: "register_page",
    area: "public_frontend",
    auth: "public",
    expected: "Registration send-code and confirm honor captcha and grant trial only once.",
    coverage: "auth-routes.test.ts",
  },
  {
    id: "account_center",
    area: "public_frontend",
    auth: "required_auth",
    expected:
      "Account center loads session, access status, and recent orders without raw identifiers.",
    coverage: "account-session.test.ts",
  },
  {
    id: "forecast_history",
    area: "history",
    auth: "required_auth",
    expected:
      "History saves only for logged-in users and locks full detail after entitlement expiry.",
    coverage: "forecast history route tests",
  },
  {
    id: "guest_free_24h_allowed",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Guest and free users can call 24h basic general forecast.",
    coverage: "forecast-routes.test.ts",
  },
  {
    id: "guest_free_extended_rejected",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Guest and free users receive upgrade_required for 48h, 72h, and 7d.",
    coverage: "forecast-routes.test.ts",
  },
  {
    id: "guest_free_subject_rejected",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Guest and free users cannot access cloud_sea, glow, or astro full features.",
    coverage: "forecast-routes.test.ts",
  },
  {
    id: "trial_paid_admin_full_access",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Trial, paid, and admin users retain full access through backend authorization.",
    coverage: "access, forecast, auth, and payment route tests",
  },
  {
    id: "expired_user_downgraded",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Expired users are downgraded to the free 24h access envelope.",
    coverage: "access and forecast route tests",
  },
  {
    id: "no_frontend_only_bypass",
    area: "commercial_access",
    auth: "backend_gate",
    expected: "Hidden buttons never replace API access checks.",
    coverage: "forecast, history, and admin route tests",
  },
  {
    id: "billing_products_public",
    area: "payment_subscription",
    auth: "public",
    expected:
      "Public pricing returns only free, monthly, quarterly, and yearly purchasable products.",
    coverage: "pricing-client, payment-routes, and products tests",
  },
  {
    id: "trial_not_purchasable",
    area: "payment_subscription",
    auth: "backend_gate",
    expected: "trial_7_days cannot be purchased from public checkout.",
    coverage: "pricing-client, payment-routes, and products tests",
  },
  {
    id: "order_product_code_only",
    area: "payment_subscription",
    auth: "required_auth",
    expected: "Order creation sends productCode and provider; price and duration come from DB.",
    coverage: "pricing-client.test.ts and payment-routes.test.ts",
  },
  {
    id: "payment_grant_idempotent",
    area: "payment_subscription",
    auth: "backend_gate",
    expected: "Manual paid and callback handling grant entitlement once.",
    coverage: "payment-routes.test.ts and payments tests",
  },
  {
    id: "account_access_state",
    area: "payment_subscription",
    auth: "required_auth",
    expected: "Account center shows free, trial, paid, expired, and admin access states.",
    coverage: "account-session.test.ts",
  },
  {
    id: "admin_login_refresh",
    area: "admin",
    auth: "admin_auth",
    expected: "Admin login, refresh, expiry redirect, and returnTo behavior stay intact.",
    coverage: "auth-routes and admin API tests",
  },
  {
    id: "admin_dashboard",
    area: "admin",
    auth: "admin_auth",
    expected: "Dashboard loads safe operational summaries and readable audit labels.",
    coverage: "admin dashboard tests",
  },
  {
    id: "admin_users_orders_products",
    area: "admin",
    auth: "admin_auth",
    expected: "Users, orders, and products pages load with human-readable labels.",
    coverage: "admin user, order, and product tests",
  },
  {
    id: "admin_provider_modules",
    area: "admin",
    auth: "admin_auth",
    expected: "Geo, weather, AI, billing, notification, captcha, storage, and CDN modules render.",
    coverage: "admin provider component tests",
  },
  {
    id: "admin_settings_audit_calibration",
    area: "admin",
    auth: "admin_auth",
    expected: "Settings, audit logs, and historical calibration pages use safe display models.",
    coverage: "admin route and component tests",
  },
  {
    id: "captcha_login_register",
    area: "auth_captcha",
    auth: "public",
    expected: "Captcha-disabled, valid-token, required, and invalid states are handled.",
    coverage: "auth-routes.test.ts",
  },
  {
    id: "session_ttl_rotation",
    area: "auth_captcha",
    auth: "backend_gate",
    expected: "Refresh rotation does not extend the absolute user or admin session window.",
    coverage: "auth-routes.test.ts",
  },
  {
    id: "frontend_auth_cache_scope",
    area: "cache_security",
    auth: "optional_auth",
    expected: "Guest, user, and admin forecast caches use separate non-token-visible keys.",
    coverage: "forecast-request-client.test.ts",
  },
  {
    id: "backend_access_cache_scope",
    area: "cache_security",
    auth: "backend_gate",
    expected: "Forecast and AI cache keys include target, horizon, start time, and access scope.",
    coverage: "forecast-routes.test.ts",
  },
  {
    id: "safe_error_and_response_surface",
    area: "cache_security",
    auth: "backend_gate",
    expected: "Responses and UI messages do not expose secrets, hashes, stack traces, or raw JSON.",
    coverage: "copy guards, API route tests, and api-client normalization",
  },
] as const satisfies readonly FunctionalMatrixEntry[];

const requiredMatrixIds = [
  "homepage_location_search",
  "homepage_guest_24h_general_forecast",
  "homepage_logged_in_full_access_forecast",
  "forecast_general_result",
  "cloud_sea_entry",
  "glow_entry",
  "astro_entry",
  "pricing_page",
  "login_page",
  "register_page",
  "account_center",
  "forecast_history",
  "guest_free_24h_allowed",
  "guest_free_extended_rejected",
  "guest_free_subject_rejected",
  "trial_paid_admin_full_access",
  "expired_user_downgraded",
  "no_frontend_only_bypass",
  "billing_products_public",
  "trial_not_purchasable",
  "order_product_code_only",
  "payment_grant_idempotent",
  "account_access_state",
  "admin_login_refresh",
  "admin_dashboard",
  "admin_users_orders_products",
  "admin_provider_modules",
  "admin_settings_audit_calibration",
  "captcha_login_register",
  "session_ttl_rotation",
  "frontend_auth_cache_scope",
  "backend_access_cache_scope",
  "safe_error_and_response_surface",
] as const;

describe("whole-site functional regression matrix", () => {
  it("covers every requested stabilization surface with unique entries", () => {
    const ids = wholeSiteFunctionalRegressionMatrix.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([...requiredMatrixIds]));
  });

  it("keeps protected flows tied to auth-aware or backend-gated coverage", () => {
    const protectedIds = [
      "homepage_logged_in_full_access_forecast",
      "forecast_history",
      "guest_free_extended_rejected",
      "guest_free_subject_rejected",
      "trial_paid_admin_full_access",
      "expired_user_downgraded",
      "no_frontend_only_bypass",
      "order_product_code_only",
      "payment_grant_idempotent",
      "admin_login_refresh",
      "frontend_auth_cache_scope",
      "backend_access_cache_scope",
    ] as const;
    const protectedEntries = wholeSiteFunctionalRegressionMatrix.filter((entry) =>
      protectedIds.includes(entry.id as (typeof protectedIds)[number]),
    );

    expect(protectedEntries).toHaveLength(protectedIds.length);
    expect(protectedEntries.every((entry) => entry.auth !== "public")).toBe(true);
  });

  it("documents cache isolation and public-safety expectations", () => {
    const text = JSON.stringify(wholeSiteFunctionalRegressionMatrix);

    expect(text).toContain("non-token-visible");
    expect(text).toContain("access scope");
    expect(text).toContain("secrets");
    expect(text).toContain("stack traces");
    expect(text).not.toMatch(/coming soon|placeholder|passwordHash|refreshTokenHash/i);
  });
});
