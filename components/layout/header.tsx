import Image from 'next/image';
import Link from 'next/link';
import logo from './hodivo-logo.png';
import { AuthBar } from '@/components/auth/auth-bar';
import { HeaderModeBreadcrumb, PrimaryNavigation } from './primary-navigation';
import { ThemeToggle } from './theme-toggle';

export function Header() {
  return (
    <header className="app-header">
      <div className="site-header page-width">
        <div className="header-brand-group">
          <Link href="/" className="brand" aria-label="Hodivo home">
            <Image
              src={logo}
              alt=""
              width={28}
              height={28}
              style={{ marginRight: 8, verticalAlign: 'middle' }}
            />
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
