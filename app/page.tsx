import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Root: signed-in owner → dashboard; everyone else → public booking page.
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }
  redirect('/book');
}
