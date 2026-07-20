'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { saveAuth, claimAnonymousAudits } from '@/lib/auth';
import { getApiUrl } from '@/lib/apiUrl';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error('Incorrect email or password.');

      saveAuth(data.token, email);
      await claimAnonymousAudits(data.token);
      router.push('/my-audits');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Sign in<span className="text-terminal-green">.</span>
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-terminal-muted mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-terminal-surface border border-terminal-border rounded-lg px-4 py-3
                       text-terminal-text focus:outline-none focus:border-terminal-green transition-colors font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-terminal-muted mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-terminal-surface border border-terminal-border rounded-lg px-4 py-3
                       text-terminal-text focus:outline-none focus:border-terminal-green transition-colors font-mono text-sm"
          />
        </div>

        {error && <p className="text-terminal-red text-sm font-mono">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-terminal-green text-terminal-bg font-bold rounded-lg
                     hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '...' : 'Sign in'}
        </button>
      </form>

      <p className="text-terminal-muted text-sm mt-6">
        No account? <Link href="/register" className="text-terminal-green hover:underline">Create one</Link>
      </p>
    </div>
  );
}
