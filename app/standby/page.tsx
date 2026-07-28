import { BellRing, CalendarClock, Sparkles } from 'lucide-react';
import { AuthLayout } from '@/components/ui/auth-layout';
import { StandbyForm } from './StandbyForm';

// PUBLIC standby / waitlist page. Reached from the booking link when a visitor
// finds no suitable slot. They register the weekdays + hour range they want; when
// a lesson in that window frees up, Ilanit is alerted and can place them.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'רשימת המתנה — אילנית' };

export default function StandbyPage() {
  return (
    <AuthLayout
      eyebrow="רשימת המתנה"
      valueProp="לא נמצאה שעה מתאימה? השאירו פרטים וטווח שעות שנוח לכם — וברגע שמתפנה מקום, ניצור קשר."
      features={[
        { icon: CalendarClock, label: 'בוחרים ימים וטווח שעות שמתאים' },
        { icon: BellRing, label: 'מתפנה מקום בטווח — מקבלים הודעה' },
        { icon: Sparkles, label: 'בלי צורך לעקוב אחרי הלוח' },
      ]}
    >
      <StandbyForm />
    </AuthLayout>
  );
}
