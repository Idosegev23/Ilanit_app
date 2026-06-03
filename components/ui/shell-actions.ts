'use server';

import { signOut } from '@/auth';

// Server action for the app-shell sign-out button. Keeps the Sidebar a client
// component while delegating the actual NextAuth sign-out to the server.
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
