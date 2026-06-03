import { getSettings } from '@/lib/settings';

// Seeds the single default settings row (idempotent — getSettings creates it
// with defaults if missing). Run with: npm run seed
async function main() {
  const settings = await getSettings();
  console.log('[seed] settings ready:', {
    id: settings.id,
    businessName: settings.businessName,
    timezone: settings.timezone,
    defaultDurationMin: settings.defaultDurationMin,
    groupBillingDay: settings.groupBillingDay,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
