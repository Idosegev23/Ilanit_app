import { LessonsView } from './LessonsView';
import { loadLessons, loadStudentOptions, loadGroupOptions } from './data';

// Lessons management screen (module B7): calendar/list view with
// approve/reject/cancel actions, manual single-lesson create, and weekly
// recurring-series create. Private area (middleware-protected). Navigation +
// page chrome (max-width, padding) come from the AppShell in app/layout.tsx.
export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const [lessons, studentOptions, groupOptions] = await Promise.all([
    loadLessons(),
    loadStudentOptions(),
    loadGroupOptions(),
  ]);

  return (
    <LessonsView
      lessons={lessons}
      studentOptions={studentOptions}
      groupOptions={groupOptions}
    />
  );
}
