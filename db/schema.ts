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
    phone: text('phone'), // E.164 — nullable: AI/calendar-created students have no phone yet (multiple NULLs allowed by the unique index)
    email: text('email'),
    // Guardian (parent) contact — for children, all outbound WhatsApp routes here.
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'), // E.164
    // Default receipt description line for this student (see lib/morning).
    receiptLabel: text('receipt_label'),
    defaultPrice: integer('default_price'), // ₪
    defaultDurationMin: integer('default_duration_min').notNull().default(60),
    notes: text('notes'),
    // WhatsApp profile picture URL, pulled from GreenAPI by phone (cached).
    avatarUrl: text('avatar_url'),
    avatarFetchedAt: timestamp('avatar_fetched_at', { withTimezone: true }),
    archived: boolean('archived').notNull().default(false),
    /*
      Whether the collection engine may talk to this family at all.

      Some parents are settled with by hand — Ilanit arranges it privately and
      does not want the system chasing them. Turning this off silences every
      OUTBOUND money message for them (the payment request, and the debt line
      that rides along on lesson reminders) while still recording what is owed,
      so the debt keeps showing up in her own reports and in the followup
      summary. It suppresses the chasing, never the bookkeeping.
    */
    autoCollect: boolean('auto_collect').notNull().default(true),
    /*
      Earliest day of the month this family may be ASKED for money (1-28), or
      null for no restriction.

      Some parents pay on a fixed date — a salary date, usually — and a request
      that arrives on the 2nd for someone who pays on the 15th is not a reminder,
      it is nagging for two weeks. The charge is still created on time and Ilanit
      still sees it; only the asking waits, and a catch-up pass sends the request
      once the day arrives.
    */
    collectFromDay: integer('collect_from_day'),
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
  // Capacity cap on active members; UI warns (and allows override) past this.
  maxMembers: integer('max_members').notNull().default(6),
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
      enum: ['booking', 'recurrence', 'calendar_import', 'manual', 'standby'],
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
    /*
      What the PARENT declared, which is not the same as money received. A Bit
      "me" link carries no amount and no reference, so nothing comes back from
      the payment itself — the intent is only a signal that Ilanit should be
      asked to confirm. `paidAt` stays the record of an actual settlement.
    */
    /*
      'paid' — the parent says it is already settled and does not say how; the
      method is captured from Ilanit, who is the one who needs it for her books.
      'bit'  — the parent opened the Bit link to pay now.
    */
    intent: text('intent', { enum: ['paid', 'bit'] }),
    intentAt: timestamp('intent_at', { withTimezone: true }),
    /** Set once Ilanit has been asked to confirm, so she is asked only once. */
    confirmAskedAt: timestamp('confirm_asked_at', { withTimezone: true }),
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
    /*
      Mirrors payments: a parent DECLARES, Ilanit confirms. Same reasoning —
      a Bit link carries no amount or reference, so nothing comes back from the
      money and a claim must not settle the charge on its own.
    */
    intent: text('intent', { enum: ['paid', 'bit'] }),
    intentAt: timestamp('intent_at', { withTimezone: true }),
    confirmAskedAt: timestamp('confirm_asked_at', { withTimezone: true }),
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
  // blocked = whole day closed; custom = replace the day's windows (legacy);
  // block_window = SUBTRACT a time window from the day (partial close);
  // force_open = OPEN a window for booking even if a lesson/event overlaps it
  // (Ilanit's explicit override of a taken slot).
  type: text('type', {
    enum: ['blocked', 'custom', 'block_window', 'force_open'],
  }).notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
});

// A week (identified by its Sunday `weekStart`, Asia/Jerusalem) is bookable via
// personal links ONLY if a row exists here. Weeks start CLOSED; Ilanit opens
// them manually. Recurring lessons & group sessions are NOT gated by this.
export const openWeeks = pgTable('open_weeks', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekStart: date('week_start').notNull().unique(), // the Sunday `yyyy-MM-dd`
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  businessName: text('business_name').notNull(),
  locationAddress: text('location_address').notNull(),
  defaultDurationMin: integer('default_duration_min').notNull().default(60),
  bufferMin: integer('buffer_min').notNull().default(15),
  leadTimeMin: integer('lead_time_min').notNull().default(120),
  bookingHorizonDays: integer('booking_horizon_days').notNull().default(30),
  reminderTime: time('reminder_time').notNull().default('18:00'),
  // A booking SUBMITTED at or after this local time needs Ilanit's approval
  // instead of confirming itself — the gate is on when the student books, not
  // on when the lesson is. NULL disables it entirely, so she can turn it off
  // without a deploy.
  approvalFromTime: time('approval_from_time').default('18:00'),
  paymentFollowupDelayH: integer('payment_followup_delay_h').notNull().default(24),
  groupBillingDay: integer('group_billing_day').notNull().default(1),
  groupFollowupDays: integer('group_followup_days').notNull().default(3),
  // Default price (₪, integer) for a private lesson, used when a student has no
  // own defaultPrice. Nullable = no default configured.
  defaultPrivatePrice: integer('default_private_price'),
  /*
    Ilanit's permanent Bit "me" link. It identifies her only — no amount, no
    reference — so the amount travels in the message text and settlement is
    still confirmed by hand.
  */
  bitLink: text('bit_link'),
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
    // 'payment' is Ilanit's own settle screen; 'pay' is the PARENT-facing one.
    type: text('type', {
      enum: ['approve', 'payment', 'assign_student', 'cancel', 'pay'],
    }).notNull(),
    /*
      A token points at EITHER a lesson or a monthly group charge — exactly one
      is set. lessonId lost its NOT NULL for that reason: a group's monthly bill
      is not a lesson, and forcing one in would have meant inventing a fake
      lesson row purely to hang a payment link off.
    */
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'cascade' }),
    groupBillingId: uuid('group_billing_id').references(() => groupBilling.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('action_tokens_hash_unique').on(t.tokenHash),
  }),
);

/*
  Bulk WhatsApp sends. A broadcast is one composed message; a recipient row is
  one delivery attempt against one PHONE (not one student — siblings share a
  parent's number, so several students can be covered by a single row).
*/
export const broadcasts = pgTable('broadcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The composed text, still containing any {שם} tokens. */
  body: text('body').notNull(),
  status: text('status', { enum: ['draft', 'sending', 'done'] })
    .notNull()
    .default('draft'),
  totalCount: integer('total_count').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastRecipients = pgTable(
  'broadcast_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    broadcastId: uuid('broadcast_id')
      .notNull()
      .references(() => broadcasts.id, { onDelete: 'cascade' }),
    // set null, not cascade: deleting a student must not erase the record that
    // we messaged them.
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    /*
      Snapshots, for the same reason lessons carry bookedByName/bookedByPhone:
      the history has to stay readable after a rename or a deletion.
      `nameSnapshot` is the name the {שם} token was rendered with.
    */
    nameSnapshot: text('name_snapshot').notNull(),
    phoneSnapshot: text('phone_snapshot').notNull(),
    /** Other students reachable at this same number, for display. */
    alsoCovers: text('also_covers'),
    status: text('status', { enum: ['pending', 'sent', 'failed'] })
      .notNull()
      .default('pending'),
    error: text('error'),
    providerMsgId: text('provider_msg_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    broadcastIdx: index('broadcast_recipients_broadcast_idx').on(t.broadcastId, t.status),
    // The double-click guard: one row per phone per broadcast.
    phoneUnique: uniqueIndex('broadcast_recipients_phone_unique').on(
      t.broadcastId,
      t.phoneSnapshot,
    ),
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
    status: text('status', {
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    })
      .notNull()
      .default('pending'),
    // Chat direction: 'out' = we sent it, 'in' = a customer replied (received via
    // the GreenAPI incoming webhook; only stored for known students).
    direction: text('direction', { enum: ['out', 'in'] }).notNull().default('out'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templateRelatedIdx: index('message_log_template_related_idx').on(
      t.template,
      t.relatedId,
    ),
    contactIdx: index('message_log_contact_idx').on(t.toPhone, t.createdAt),
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

// Standby / waitlist. A visitor who found no suitable slot registers interest in
// a set of weekdays + an hour range. When a lesson in that window is cancelled,
// Ilanit is alerted and can place the waitlisted person on the freed slot.
export const standbyRequests = pgTable(
  'standby_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Linked once matched/created; kept if the student is later removed.
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    // Wanted weekdays as a CSV of JS weekday numbers (0=Sun … 6=Sat), e.g. "0,2,4".
    weekdays: text('weekdays').notNull(),
    startTime: text('start_time').notNull(), // HH:mm (Asia/Jerusalem)
    endTime: text('end_time').notNull(), // HH:mm (Asia/Jerusalem)
    status: text('status', { enum: ['active', 'fulfilled', 'cancelled'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('standby_status_idx').on(t.status),
  }),
);

// A concrete freed slot offered to the waitlist. Created when a lesson in some
// standby's window is cancelled; the token backs the owner-only approval link.
export const standbyOffers = pgTable(
  'standby_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['open', 'filled', 'expired'] })
      .notNull()
      .default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    filledAt: timestamp('filled_at', { withTimezone: true }),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('standby_offers_hash_unique').on(t.tokenHash),
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
export type StandbyRequest = typeof standbyRequests.$inferSelect;
export type NewStandbyRequest = typeof standbyRequests.$inferInsert;
export type StandbyOffer = typeof standbyOffers.$inferSelect;
export type NewStandbyOffer = typeof standbyOffers.$inferInsert;
export type OpenWeek = typeof openWeeks.$inferSelect;
export type NewOpenWeek = typeof openWeeks.$inferInsert;
