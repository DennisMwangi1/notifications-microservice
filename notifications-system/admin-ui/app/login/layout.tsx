import type { Metadata } from 'next';
import { theme } from '../../lib/theme-config';

export const metadata: Metadata = {
    title: `Login | ${theme.brandName}`,
    description: `Sign in to the ${theme.brandName} admin console`,
};

export default function LoginLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Login page renders without the sidebar shell
    return <>{children}</>;
}
