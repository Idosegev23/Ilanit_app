// Typed STUB — implemented by feature agent B2 (Booking).
// Availability engine: template − exceptions − lessons − freeBusy − lead-time −
// past, split into duration+buffer slots. Same engine feeds occupancy.

export interface Slot {
  startISO: string;
  endISO: string;
  label: string;
}

export async function availableSlots(_dateISO: string): Promise<Slot[]> {
  throw new Error('NOT_IMPLEMENTED: availableSlots');
}

export async function occupancy(
  _fromISO: string,
  _toISO: string,
): Promise<{ capacity: number; booked: number; pct: number }> {
  throw new Error('NOT_IMPLEMENTED: occupancy');
}
