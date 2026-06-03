// Typed STUB — implemented by feature agent B7 (Recurrence/Lessons).
// createSeries generates lessons/group_sessions forward + a Google recurring
// event (via lib/google-calendar). cancelSeries / cancelOne handle teardown.

export interface CreateSeriesInput {
  kind: 'individual' | 'group';
  studentId?: string;
  groupId?: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  price?: number;
  horizonDays: number;
}

export async function createSeries(
  _input: CreateSeriesInput,
): Promise<{ count: number }> {
  throw new Error('NOT_IMPLEMENTED: createSeries');
}

export async function cancelSeries(_recurrenceId: string): Promise<void> {
  throw new Error('NOT_IMPLEMENTED: cancelSeries');
}

export async function cancelOne(_lessonId: string): Promise<void> {
  throw new Error('NOT_IMPLEMENTED: cancelOne');
}
