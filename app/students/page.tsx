import Link from 'next/link';
import { ChevronLeft, Users, Archive } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { listStudents } from '@/lib/students';
import { formatShekels } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Protected (middleware-guarded) student directory. Each row links to the full
// client file at /students/[id].
export default async function StudentsPage() {
  const students = await listStudents();

  return (
    <div className="space-y-6">
      <PageHeader
        title="תלמידים"
        subtitle={
          students.length > 0
            ? `${students.length} תלמידים במאגר`
            : 'מאגר התלמידים — כרטיס לכל תלמיד'
        }
      />

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="עדיין אין תלמידים"
          description="תלמידים נוספים אוטומטית למאגר בעת תיאום שיעור דרך לינק התיאום."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>שם</TableHead>
              <TableHead>טלפון</TableHead>
              <TableHead className="text-end">מחיר ברירת מחדל</TableHead>
              <TableHead>
                <span className="sr-only">פתיחת תיק</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id} className="group">
                <TableCell>
                  <Link
                    href={`/students/${s.id}`}
                    className="inline-flex items-center gap-2 rounded-lg font-medium text-ink transition-colors duration-150 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {s.name}
                    {s.archived && (
                      <Badge tone="muted">
                        <Archive className="size-3.5" aria-hidden="true" />
                        בארכיון
                      </Badge>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <span dir="ltr" className="tabular-nums text-muted">
                    {s.phone}
                  </span>
                </TableCell>
                <TableNumCell>
                  {s.defaultPrice != null ? (
                    <span className="font-medium text-ink">{formatShekels(s.defaultPrice)}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </TableNumCell>
                <TableCell className="text-end">
                  <Link
                    href={`/students/${s.id}`}
                    aria-label={`פתיחת תיק התלמיד ${s.name}`}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-primary-50 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {/* RTL: chevron points to the start (right) */}
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
