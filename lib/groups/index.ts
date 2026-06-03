// Typed STUB — implemented by feature agent B5 (Groups).
// listGroups / createGroup / members CRUD / generateMonthlyBilling /
// markBillingPaid (→ Morning receipt + Blob + WhatsApp) / rosterFor.

export async function generateMonthlyBilling(
  _monthISO: string,
): Promise<{ created: number }> {
  throw new Error('NOT_IMPLEMENTED: generateMonthlyBilling');
}

export async function markBillingPaid(
  _billingId: string,
  _method?: string,
): Promise<void> {
  throw new Error('NOT_IMPLEMENTED: markBillingPaid');
}

export async function rosterFor(
  _groupId: string,
  _monthISO: string,
): Promise<Array<{ studentId: string; name: string; status: string; amount: number }>> {
  throw new Error('NOT_IMPLEMENTED: rosterFor');
}
