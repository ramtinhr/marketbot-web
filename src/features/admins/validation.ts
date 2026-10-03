import { msg, type Message } from '../../i18n';

// Mirrors marketbot-api's rules, so a bad value is caught before the request.
export const PASSWORD_MIN = 12;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

export function usernameProblem(username: string): Message | null {
    return USERNAME_RE.test(username) ? null : msg('admins.error.username');
}

export function passwordProblem(password: string, confirm: string): Message | null {
    if (password.length < PASSWORD_MIN) return msg('admins.error.passwordShort', { min: PASSWORD_MIN });
    if (password !== confirm) return msg('admins.error.mismatch');
    return null;
}

/** 20 characters from an alphabet without look-alikes: about 115 bits. */
export function generatePassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!@#%';
    const bytes = crypto.getRandomValues(new Uint32Array(20));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
