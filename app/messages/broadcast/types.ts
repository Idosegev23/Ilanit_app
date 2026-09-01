// Serialisable shape handed from the server page to the client picker. Dates
// cross the boundary as ISO strings.
export interface AudienceRow {
  id: string;
  name: string;
  phone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  archived: boolean;
  groups: string[];
  nextLessonAt: string | null;
  lastLessonAt: string | null;
}
