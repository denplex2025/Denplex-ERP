/** Roles allowed to see rupee figures on the mobile Home/Dashboard screens — every other role sees
 * counts and status only, no amounts. Per Neel (2026-08-18): "only accounts and admin guy need to
 * see that [invoice amounts], not all person." Keep this list in sync with any future finance-facing
 * role additions. */
export const MONEY_ROLES = ["admin", "accountant", "ca"];

export function canSeeMoney(user) {
  return MONEY_ROLES.includes(user?.role);
}

export const MASKED_AMOUNT = "••••••";
