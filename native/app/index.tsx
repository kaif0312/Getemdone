import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

/** Entry: signed in -> Today, signed out -> Welcome. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/today' : '/welcome'} />;
}
