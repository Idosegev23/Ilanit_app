import { PageHeader } from '@/components/ui/page-header';
import { listBlocks, blocksHorizon } from '@/lib/availability/blocks';
import { AvailabilityView } from './AvailabilityView';

// Availability manager — the "everything open, mark what to close" model. Within
// the operating hours (weekly template, edited in /settings) everything is
// bookable EXCEPT existing lessons and the blocks set here: a time window, a full
// day, or a date range (vacation).

export const dynamic = 'force-dynamic';
export const metadata = { title: 'זמינות — אילנית' };

export default async function AvailabilityPage() {
  const { from, to } = blocksHorizon();
  const blocks = await listBlocks(from, to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="זמינות"
        subtitle="בתוך שעות הפעילות הכל פתוח לתיאום — כאן חוסמים מה שסגור: חלון שעות, יום מלא, או תקופה (חופשה). שיעורים שכבר נקבעו תפוסים אוטומטית."
      />
      <AvailabilityView initialBlocks={blocks} />
    </div>
  );
}
