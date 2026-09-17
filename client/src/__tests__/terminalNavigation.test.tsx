import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import HomePage from '../pages/HomePage';
import { useAppStore } from '../store/useAppStore';

describe('Dual-Market Terminal Routing & Sidebar Differentiation', () => {
  beforeEach(() => {
    useAppStore.setState({
      userId: 'test-user',
      ready: true,
      connected: true,
      mode: 'PAPER',
      accountType: 'SPOT',
    });
  });

  it('TC-TERM-01: Highlights Crypto terminal on /spot and NOT India terminal', () => {
    render(
      <MemoryRouter initialEntries={['/spot']}>
        <Sidebar open={false} onClose={() => {}} />
      </MemoryRouter>
    );

    const [cryptoLink] = screen.getAllByRole('link', { name: /CRYPTO/i });
    const [indiaLink] = screen.getAllByRole('link', { name: /INDIA/i });

    // Active link has white text (#ffffff)
    expect(cryptoLink.style.color).toBe('rgb(255, 255, 255)');
    expect(indiaLink.style.color).not.toBe('rgb(255, 255, 255)');
  });

  it('TC-TERM-02: Highlights India Terminal on /india and NOT Crypto Terminal', () => {
    render(
      <MemoryRouter initialEntries={['/india']}>
        <Sidebar open={false} onClose={() => {}} />
      </MemoryRouter>
    );

    const [indiaLink] = screen.getAllByRole('link', { name: /INDIA/i });
    const [cryptoLink] = screen.getAllByRole('link', { name: /CRYPTO/i });

    expect(indiaLink.style.color).toBe('rgb(255, 255, 255)');
    expect(cryptoLink.style.color).not.toBe('rgb(255, 255, 255)');
  });

  it('TC-TERM-03: Renders Crypto Spot Terminal view on /crypto', () => {
    render(
      <MemoryRouter initialEntries={['/crypto']}>
        <HomePage defaultTerminal="SPOT" />
      </MemoryRouter>
    );

    expect(screen.getByText('Crypto Spot & Portfolio Terminal')).toBeInTheDocument();
    expect(screen.getByText('SPOT 1:1')).toBeInTheDocument();
    expect(screen.getByText(/CRYPTO SPOT PORTFOLIO EQUITY/i)).toBeInTheDocument();
  });

  it('TC-TERM-04: Renders Binance USD-M Futures Terminal view on /futures', () => {
    render(
      <MemoryRouter initialEntries={['/futures']}>
        <HomePage defaultTerminal="FUTURES" />
      </MemoryRouter>
    );

    expect(screen.getByText('Binance USD-M Futures Terminal')).toBeInTheDocument();
    expect(screen.getAllByText('⚡ 24/7 PERPETUAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/BINANCE USD-M FUTURES EQUITY/i)).toBeInTheDocument();
    expect(screen.getByText(/MARGIN RATIO & HEAT/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AVAILABLE FUTURES MARGIN/i).length).toBeGreaterThanOrEqual(1);
  });
});
