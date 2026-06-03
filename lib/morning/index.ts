// Typed STUB — implemented by feature agent B4 (Payments/Receipts).
// Morning client: token auth, createReceipt(payload) → official doc + PDF URL.

export interface ReceiptInput {
  clientName: string;
  clientPhone?: string;
  amount: number; // ₪ integer
  description: string;
  method?: 'bit' | 'cash' | 'transfer' | 'other';
}

export async function createReceipt(
  _i: ReceiptInput,
): Promise<{ docId: string; docNumber: string; pdfUrl: string }> {
  throw new Error('NOT_IMPLEMENTED: createReceipt');
}
