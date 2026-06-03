import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Root is Ilanit's entry: signed-in owner → dashboard; otherwise → login.
// Students never land here — they open a PERSONAL booking link (/book/[token])
// that Ilanit sends them over WhatsApp.
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }
  redirect('/login');
}
