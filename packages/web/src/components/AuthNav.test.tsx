import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const authMock = vi.hoisted(() => ({
  isLoggedIn: vi.fn(),
  getEmail: vi.fn(),
  clearAuth: vi.fn(),
}));
vi.mock('@/lib/auth', () => authMock);

import AuthNav from './AuthNav';

beforeEach(() => {
  push.mockClear();
  authMock.isLoggedIn.mockReset();
  authMock.getEmail.mockReset();
  authMock.clearAuth.mockReset();
});

describe('AuthNav', () => {
  it('shows Sign in / Register when logged out', async () => {
    authMock.isLoggedIn.mockReturnValue(false);
    authMock.getEmail.mockReturnValue(null);

    render(<AuthNav />);

    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy());
    expect(screen.getByText('Register')).toBeTruthy();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  it("shows the user's email and Sign out when logged in", async () => {
    authMock.isLoggedIn.mockReturnValue(true);
    authMock.getEmail.mockReturnValue('user@example.com');

    render(<AuthNav />);

    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('clears auth and redirects home on Sign out', async () => {
    authMock.isLoggedIn.mockReturnValue(true);
    authMock.getEmail.mockReturnValue('user@example.com');

    render(<AuthNav />);
    const signOut = await waitFor(() => screen.getByText('Sign out'));
    fireEvent.click(signOut);

    expect(authMock.clearAuth).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/');
    expect(screen.getByText('Sign in')).toBeTruthy();
  });
});
