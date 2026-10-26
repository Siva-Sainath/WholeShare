# Feature: Subscriptions Clan Billing & Recurring Replenishment

Automated recurring billing plans for ongoing clan replenishment schedules built on PayPal Subscriptions API rails.

## Sub-features
- `recurring-billing-plan`: Defines monthly or weekly billing tiers with fixed pricing.
- `clan-subscriber-onboarding`: Enrolls SME buyers into shared recurring replenishment schedules.
- `plan-lifecycle-management`: Manages subscription status transitions including pause and cancel.

## How to get to it (user POV)
- In the Clan Lobby, select a clan and switch delivery cadence from One-Time to Weekly Subscription.
- Review recurring terms and approve billing authorization.

## Driving it with control-syndicate
Preconditions:
- Node.js runtime active.
- Live PayPal Sandbox credentials configured in .env.

Step-by-step driving commands:
```bash
# 1. Create a live recurring billing plan on PayPal Subscriptions
node scripts/control-paypal.js subscription:plan --name "Weekly Flour Replenishment" --amount 7500

# 2. Inspect subscription tools via the agent toolkit
node scripts/control-paypal.js toolkit:execute --tool list_subscription_plans

# 3. Verify clan recurring schedule state through master syndicate control
node .cursor/skills/verify-syndicate/control-syndicate.mjs doctor
```

Proof standards:
- PayPal returns HTTP 201 Created with valid plan ID starting with P-.
- Plan status evaluates to ACTIVE or CREATED with correct billing cycle interval.
- Toolkit inspection confirms registration of subscription management actions.

## Gotchas
- Subscriptions require an active PayPal product ID prior to plan creation.
- Buyers can cancel active subscriptions directly through their PayPal consumer portal.
