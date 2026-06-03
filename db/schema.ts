import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────────────────────
// Money is ALWAYS integer shekels (no agorot). Times are timestamptz; business
// logic runs in Asia/Jerusalem (see lib/time.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone').notNull(), // E.164
    email: text('email'),
    defaultPrice: integer('default_price'), // ₪
    defaultDurationMin: integer('default_duration_min').notNull().default(60),
    notes: text('notes'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex('students_phone_unique').on(t.phone),
  }),
);

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  monthlyPrice: integer('monthly_price').notNull(), // ₪
  location: text('location').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupStudentUnique: uniqueIndex('group_members_group_student_unique').on(
      t.groupId,
      t.studentId,
    ),
  }),
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type', { enum: ['individual', 'group_session'] })
      .notNull()
      .default('individual'),
    source: text('source', {
      enum: ['booking', 'recurrence', 'calendar_import', 'manual'],
    }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status', {
      enum: ['pending', 'confirmed', 'completed', 'rejected', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    needsMatch: boolean('needs_match').notNull().default(false),
    price: integer('price'), // snapshot ₪
    location: text('location'), // snapshot
    googleEventId: text('google_event_id'),
    recurrenceId: uuid('recurrence_id'),
    bookedByName: text('booked_by_name'),
    bookedByPhone: text('booked_by_phone'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
  },
  (t) => ({
    startsAtIdx: index('lessons_starts_at_idx').on(t.startsAt),
    statusIdx: index('lessons_status_idx').on(t.status),
    studentIdx: index('lessons_student_idx').on(t.studentId),
    googleEventIdx: index('lessons_google_event_idx').on(t.googleEventId),
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['due', 'paid', 'waived'] })
      .notNull()
      .default('due'),
    amount: integer('amount').notNull(), // ₪
    method: text('method', { enum: ['bit', 'cash', 'transfer', 'other'] }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lessonUnique: uniqueIndex('payments_lesson_unique').on(t.lessonId),
  }),
);

export const groupBilling = pgTable(
  'group_billing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    month: date('month').notNull(), // first-of-month date
    amount: integer('amount').notNull(), // ₪
    status: text('status', { enum: ['due', 'paid', 'waived'] })
      .notNull()
      .default('due'),
    method: text('method', { enum: ['bit', 'cash', 'transfer', 'other'] }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    receiptId: uuid('receipt_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupStudentMonthUnique: uniqueIndex('group_billing_group_student_month_unique').on(
      t.groupId,
      t.studentId,
      t.month,
    ),
  }),
);

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  groupBillingId: uuid('group_billing_id').references(() => groupBilling.id, {
    onDelete: 'set null',
  }),
  morningDocId: text('morning_doc_id').notNull(),
  morningDocNumber: text('morning_doc_number').notNull(),
  docType: text('doc_type').notNull(),
  amount: integer('amount').notNull(), // ₪
  pdfUrl: text('pdf_url').notNull(), // Vercel Blob
  status: text('status', { enum: ['created', 'sent', 'failed'] })
    .notNull()
    .default('created'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const availability = pgTable('availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekday: integer('weekday').notNull(), // 0-6 (0 = Sunday)
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  active: boolean('active').notNull().default(true),
});

export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  type: text('type', { enum: ['blocked', 'custom'] }).notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
});

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: text('business_name').notNull(),
  locationAddress: text('location_address').notNull(),
  defaultDurationMin: integer('default_duration_min').notNull().default(60),
  bufferMin: integer('buffer_min').notNull().default(15),
  leadTimeMin: integer('lead_time_min').notNull().default(120),
  bookingHorizonDays: integer('booking_horizon_days').notNull().default(14),
  reminderTime: time('reminder_time').notNull().default('18:00'),
  paymentFollowupDelayH: integer('payment_followup_delay_h').notNull().default(24),
  groupBillingDay: integer('group_billing_day').notNull().default(1),
  groupFollowupDays: integer('group_followup_days').notNull().default(3),
  // Default price (₪, integer) for a private lesson, used when a student has no
  // own defaultPrice. Nullable = no default configured.
  defaultPrivatePrice: integer('default_private_price'),
  morningDocType: text('morning_doc_type'),
  morningBusinessMeta: jsonb('morning_business_meta'),
  timezone: text('timezone').notNull().default('Asia/Jerusalem'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const googleTokens = pgTable('google_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountEmail: text('account_email').notNull().unique(),
  refreshToken: text('refresh_token').notNull(), // encrypted AES-256-GCM
  accessToken: text('access_token'), // encrypted AES-256-GCM
  expiry: timestamp('expiry', { withTimezone: true }),
  calendarId: text('calendar_id').notNull().default('primary'),
  scope: text('scope'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const actionTokens = pgTable(
  'action_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    type: text('type', { enum: ['approve', 'payment', 'assign_student'] }).notNull(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('action_tokens_hash_unique').on(t.tokenHash),
  }),
);

export const messageLog = pgTable(
  'message_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toPhone: text('to_phone').notNull(),
    template: text('template').notNull(),
    body: text('body').notNull(),
    relatedLessonId: uuid('related_lesson_id'),
    relatedId: text('related_id'),
    providerMsgId: text('provider_msg_id'),
    status: text('status', { enum: ['pending', 'sent', 'failed'] })
      .notNull()
      .default('pending'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templateRelatedIdx: index('message_log_template_related_idx').on(
      t.template,
      t.relatedId,
    ),
  }),
);

export const bookingLinks = pgTable(
  'booking_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('booking_links_hash_unique').on(t.tokenHash),
    studentIdx: index('booking_links_student_idx').on(t.studentId),
  }),
);

export const insightsCache = pgTable('insights_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  period: text('period').notNull(),
  stats: jsonb('stats').notNull(),
  aiText: text('ai_text').notNull(),
  model: text('model').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const recurrences = pgTable('recurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['individual', 'group'] }).notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(), // 0-6
  startTime: time('start_time').notNull(),
  durationMin: integer('duration_min').notNull(),
  price: integer('price'), // ₪
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentAliases = pgTable('student_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  aliasType: text('alias_type', { enum: ['email', 'title'] }).notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Inferred types ───────────────────────────────────────────────────────────
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;
export type Availability = typeof availability.$inferSelect;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type GoogleToken = typeof googleTokens.$inferSelect;
export type ActionToken = typeof actionTokens.$inferSelect;
export type MessageLog = typeof messageLog.$inferSelect;
export type NewMessageLog = typeof messageLog.$inferInsert;
export type InsightsCache = typeof insightsCache.$inferSelect;
export type Recurrence = typeof recurrences.$inferSelect;
export type NewRecurrence = typeof recurrences.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupBilling = typeof groupBilling.$inferSelect;
export type NewGroupBilling = typeof groupBilling.$inferInsert;
export type StudentAlias = typeof studentAliases.$inferSelect;
export type BookingLink = typeof bookingLinks.$inferSelect;
export type NewBookingLink = typeof bookingLinks.$inferInsert;
