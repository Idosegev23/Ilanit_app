import { PageHeader } from '@/components/ui/page-header';
import { monthDayStates } from '@/lib/availability';
import { dayKey, startOfMonthKey, monthGridKeys } from '../lessons/calendar/calendar-lib';
import { AvailabilityView } from './AvailabilityView';

// Interactive availability calendar — a monthly view of days + their slots, where
// Ilanit marks each slot open/closed (respecting remaining availability: lessons
// are taken, past slots locked). Within operating hours everything is open unless
// closed here; the public booking link reflects it live.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'זמינות — אילנית' };

export default async function AvailabilityPage() {
  const today = dayKey(new Date());
  const monthAnchor = startOfMonthKey(today);
  const grid = monthGridKeys(monthAnchor);
  const initialStates = await monthDayStates(grid[0], grid[grid.length - 1]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="זמינות"
        subtitle="לוח חודשי של הימים והשעות. בתוך שעות הפעילות הכל פתוח — לוחצים על משבצת כדי לסמן פנוי/סגור. שיעורים שנקבעו תפוסים אוטומטית."
      />
      <AvailabilityView
        today={today}
        initialMonthAnchor={monthAnchor}
        initialStates={initialStates}
      />
    </div>
  );
}
