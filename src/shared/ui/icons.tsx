import type { ReactNode } from 'react';

/** A 24-unit line icon; decorative, so hidden from assistive tech. */
export function Icon({ size = 16, strokeWidth = 1.8, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    );
}

export const LogoutIcon = () => (
    <Icon size={15}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>
);

export const InfoIcon = () => (
    <Icon size={13}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>
);

export const MenuIcon = () => <Icon size={18} strokeWidth={2}><path d="M3 6h18M3 12h18M3 18h18" /></Icon>;

export const MoonIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);

export const SunIcon = () => (
    <Icon size={13} strokeWidth={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);

export const EyeIcon = () => (
    <Icon><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
);

export const EyeOffIcon = () => (
    <Icon>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" />
    </Icon>
);
