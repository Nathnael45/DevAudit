'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isLoggedIn, getEmail, clearAuth } from '@/lib/auth';

// Reads localStorage, so login state can't be known during SSR — this whole
// component (not just a hook inside it) lives in a client boundary that
// starts logged-out and corrects itself on mount, matching what the server
// actually rendered and avoiding a hydration mismatch.
export default function AuthNav() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setLoggedIn(isLoggedIn());
    setEmail(getEmail());
  }, []);

  function handleSignOut() {
    clearAuth();
    setLoggedIn(false);
    setEmail(null);
    router.push('/');
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/my-audits" className="text-terminal-muted hover:text-terminal-text transition-colors">
        My Audits
      </Link>
      {loggedIn ? (
        <>
          <span className="text-terminal-muted text-xs hidden sm:inline">{email}</span>
          <button onClick={handleSignOut} className="text-terminal-muted hover:text-terminal-text transition-colors">
            Sign out
          </button>
        </>
      ) : (
        <>
          <Link href="/login" className="text-terminal-muted hover:text-terminal-text transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="text-terminal-green hover:underline">
            Register
          </Link>
        </>
      )}
    </div>
  );
}
