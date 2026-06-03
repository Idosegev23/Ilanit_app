import { Nav } from '@/components/ui/nav';
import { LessonsView } from './LessonsView';
import { loadLessons, loadStudentOptions, loadGroupOptions } from './data';

// Lessons management screen (module B7): calendar/list view with
// approve/reject/cancel actions, manual single-lesson create, and weekly
// recurring-series create. Private area (middleware-protected).
export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const [lessons, studentOptions, groupOptions] = await Promise.all([
    loadLessons(),
    loadStudentOptions(),
    loadGroupOptions(),
  ]);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">שיעורים</h1>
        <LessonsView
          lessons={lessons}
          studentOptions={studentOptions}
          groupOptions={groupOptions}
        />
      </main>
    </div>
  );
}
