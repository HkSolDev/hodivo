import Link from 'next/link';
import { AuthBar } from '@/components/auth/auth-bar';
import {
  HeaderModeBreadcrumb,
  PrimaryNavigation,
} from './primary-navigation';
import { ThemeToggle } from './theme-toggle';

export function Header() {
  return (
    <header className="app-header">
      <div className="site-header page-width">
        <div className="header-brand-group">
          <Link href="/" className="brand" aria-label="Hodivo home">
            Hodivo
            <span className="brand-dot" aria-hidden="true" />
          </Link>
          <HeaderModeBreadcrumb />
        </div>
        <div className="header-actions">
          <PrimaryNavigation />
          <div className="header-utility">
            <ThemeToggle />
            <AuthBar />
          </div>
        </div>
      </div>
    </header>
  );
}
