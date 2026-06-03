import { PageHeader } from '@/components/ui/page-header';
import { listStudents } from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { StudentsTable, type StudentRow } from './students-table';

export const dynamic = 'force-dynamic';

// Protected (middleware-guarded) student directory. Server-fetches the roster +
// the settings default private-lesson price, then hands off to the client
// directory (stats band, search, premium list, create dialog). Each row links
// to the full client file at /students/[id].
export default async function StudentsPage() {
  const [students, settings] = await Promise.all([listStudents(), getSettings()]);

  const rows: StudentRow[] = students.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    defaultPrice: s.defaultPrice,
    defaultDurationMin: s.defaultDurationMin,
    email: s.email,
    notes: s.notes,
    archived: s.archived,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="מאגר"
        title="תלמידים"
        subtitle={
          rows.length > 0
            ? `${rows.length} תלמידים — כרטיס לכל תלמיד/ה`
            : 'מאגר התלמידים — כרטיס לכל תלמיד/ה'
        }
      />

      <StudentsTable students={rows} settingsDefaultPrice={settings.defaultPrivatePrice} />
    </div>
  );
}
