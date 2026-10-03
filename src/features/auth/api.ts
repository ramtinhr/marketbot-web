import { request } from '../../shared/api';

export interface Admin { id: number; username: string }

export const authApi = {
    me: () => request<{ admin: Admin }>('/auth/me').then((r) => r.admin),
    login: (username: string, password: string) =>
        request<{ admin: Admin }>('/auth/login', { method: 'POST', body: { username, password } }).then((r) => r.admin),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
        request<void>('/auth/password', { method: 'POST', body: { current_password: currentPassword, new_password: newPassword } }),
};
