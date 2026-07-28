'use server';

// PUBLIC standby registration (no auth — anyone with the link can join the
// waitlist). Parses the form and delegates to the standby engine.

import { createStandbyRequest, type StandbyResult } from '@/lib/standby';

export async function submitStandby(
  _prev: StandbyResult,
  formData: FormData,
): Promise<StandbyResult> {
  const weekdays = formData
    .getAll('weekdays')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  return createStandbyRequest({
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    weekdays,
    startTime: String(formData.get('startTime') ?? ''),
    endTime: String(formData.get('endTime') ?? ''),
  });
}
