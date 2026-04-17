import type { Metadata } from 'next';
import { theme } from '../../../lib/theme-config';

export const metadata: Metadata = {
  title: `Tenant Login | ${theme.brandName}`,
  description: `Sign in to the ${theme.brandName} tenant console`,
};

export default function TenantLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
