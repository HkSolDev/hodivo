import type { Metadata } from 'next';
import { SignInView } from '@/components/auth/sign-in-view';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return <SignInView />;
}
