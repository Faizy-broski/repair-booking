// Flat annual-billing discount applied to every plan (Starter/Growth/
// Professional/Custom) — mirrors CUSTOM_PLAN_YEARLY_DISCOUNT in
// src/backend/services/custom-plan-pricing.ts (the backend equivalent).
// Annual total = monthly * 12 * (1 - ANNUAL_DISCOUNT), never a stored
// per-plan price_yearly value.
export const ANNUAL_DISCOUNT = 0.10
