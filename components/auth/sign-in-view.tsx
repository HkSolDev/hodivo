'use client';

import Link from 'next/link';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { AuthBar } from './auth-bar';

export function SignInView() {
  const { accountName, sessionChecked } = useWorkspace();
  const signedIn = sessionChecked && accountName !== null;

  return (
    <section className="signin-panel panel" aria-labelledby="signin-title">
      <h1 id="signin-title">
        {signedIn ? 'Sign-in & security' : 'Sign in to Hodivo'}
      </h1>
      <p className="muted">
        {signedIn
          ? 'Manage your account session and passkeys.'
          : 'Get job recommendations based on your profile.'}
      </p>
      <AuthBar presentation="signin" />
      {!signedIn && (
        <p className="small muted">
          Already set up a passkey? Use your fingerprint, face or device PIN.
        </p>
      )}
      <Link className="signin-browse" href="/">
        Continue browsing jobs
      </Link>
      {!signedIn && (
        <div className="signin-note">
          <strong>New to Hodivo?</strong>
          <p>
            Continue with Google. You can set up a passkey after signing in.
          </p>
        </div>
      )}
      <noscript>
        <p className="notice">
          Sign-in needs JavaScript. You can still browse jobs without signing
          in.
        </p>
      </noscript>
    </section>
  );
}
