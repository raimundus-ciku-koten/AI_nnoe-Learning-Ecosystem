# Release Approval Form — AI_nnoe Learning Ecosystem

This form is for final owner approval before public release. Use it as a sign-off checklist for Preview and Production deployment.

## 1) Source and branch approval
- [ ] Source branch for release has been confirmed and recorded.
- [ ] Target environment is confirmed (Preview/Production).
- [ ] Local or preview commit is not treated as production source without explicit approval.
- [ ] Owner approval signature/date recorded below.

## 2) Security and governance approval
- [ ] Production backup has been created and restore tested successfully.
- [ ] Staging and Production schema parity has been reviewed.
- [ ] Supabase RLS, auth hook, and fail-closed behavior were reviewed.
- [ ] Turnstile validation has been checked for missing, invalid, expired, wrong-host, and valid tokens.
- [ ] Public signup remains blocked before final approval.
- [ ] Billing and checkout remain blocked until Midtrans is approved.
- [ ] Ads remain blocked until AdSense/AdMob approval is complete.

## 3) Environment approval
### Preview environment
- [ ] `VITE_SUPABASE_URL` = `https://samszhfyhbjuculrcffg.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY` is from Supabase Staging.
- [ ] `VITE_TURNSTILE_SITE_KEY` is from the exact Preview hostname widget.
- [ ] No `service_role` key is present in frontend environment variables.

### Production environment
- [ ] `VITE_SUPABASE_URL` = `https://jvcrmzmuxgyuetkjqady.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY` is from Supabase Production.
- [ ] Until signup is release-cleared, new signups are disabled in Supabase Production Auth and both public signup flags are false in Vercel Production.
- [ ] When enabling signup, `VITE_TURNSTILE_SITE_KEY` is from a widget restricted to the exact Production hostname and Supabase validates it server-side.
- [ ] CAPTCHA missing/invalid/expired/wrong-host/valid-token tests passed; `PRODUCTION_CAPTCHA_VERIFIED=true` is set only after evidence is recorded.
- [ ] `PRODUCTION_DEMO_TRIAL_VERIFIED=true` only after the Production trial migration and end-to-end trial flow pass.
- [ ] `PRODUCTION_SCHOOL_SIGNUP_VERIFIED=true` only after its migration, RLS, MFA review, and end-to-end flow pass.
- [ ] No `service_role` key is present in frontend environment variables.

## 4) Deployment and smoke-test approval
- [ ] `npm run check:vercel-env` passed.
- [ ] `npm test` passed.
- [ ] `npm run build` passed.
- [ ] Preview deployment passed smoke tests.
- [ ] Production deployment passed smoke tests.
- [ ] Protected routes remain blocked until authentication is valid.

## 5) Final owner sign-off
Owner name: ________________________________
Date: ________________________________
Signature: ________________________________

Approval statement:
- [ ] I approve the release branch and environment settings above.
- [ ] I confirm the Production backup and restore test are valid.
- [ ] I confirm Turnstile validation is complete for the target environment.
- [ ] I confirm public signup, payment, and ads remain disabled until separately approved.
