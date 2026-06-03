import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Root is Ilanit's entry: signed-in owner → dashboard; otherwise → login.
// The public booking page (/book) is a separate link Ilanit shares with students.
export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }
  redirect('/login');
}
