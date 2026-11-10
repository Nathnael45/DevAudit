import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportNav, { NavItem } from './ReportNav';

const items: NavItem[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'findings', label: 'Findings', count: 3 },
  { id: 'critical', label: 'Critical', count: 1, indent: true, dotClass: 'bg-red-500' },
  { id: 'reasoning', label: 'Full AI reasoning' },
];

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom has no layout engine, so scrolling is stubbed.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ReportNav', () => {
  it('lists every section as a link to its anchor, with counts', () => {
    render(<ReportNav items={items} variant="sidebar" />);

    expect(screen.getByRole('link', { name: /Summary/ }).getAttribute('href')).toBe('#summary');
    expect(screen.getByRole('link', { name: /Critical/ }).textContent).toContain('1');
    expect(screen.getByRole('link', { name: /Findings/ }).textContent).toContain('3');
  });

  it('marks the first section as current before any scrolling', () => {
    render(<ReportNav items={items} variant="sidebar" />);
    expect(screen.getByRole('link', { name: /Summary/ }).getAttribute('aria-current')).toBe('location');
  });

  it('scrolls to a section on click and marks it current', () => {
    const target = document.createElement('div');
    target.id = 'critical';
    document.body.appendChild(target);
    render(<ReportNav items={items} variant="bar" />);

    const link = screen.getByRole('link', { name: /Critical/ });
    fireEvent.click(link);

    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(link.getAttribute('aria-current')).toBe('location');
  });

  it('opens the collapsed reasoning section when jumping to it', () => {
    const details = document.createElement('details');
    details.id = 'reasoning';
    document.body.appendChild(details);
    render(<ReportNav items={items} variant="sidebar" />);

    fireEvent.click(screen.getByRole('link', { name: /Full AI reasoning/ }));

    expect(details.open).toBe(true);
  });
});
