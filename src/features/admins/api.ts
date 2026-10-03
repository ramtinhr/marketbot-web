import { useMutation, useQueryClient } from '@tanstack/react-query';

import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { authApi } from '../auth/api';

export interface AdminRow {
    id: number;
    username: string;
    created_at: string;
    created_by: string | null;
    last_login_at: string | null;
    active_sessions: number;
}

export const adminsApi = {
    list: (signal?: AbortSignal) => request<{ admins: AdminRow[] }>('/admins', { signal }).then((r) => r.admins),
    create: (username: string, password: string) => request<void>('/admins', { method: 'POST', body: { username, password } }),
    remove: (id: number) => request<void>(`/admins/${id}`, { method: 'DELETE' }),
    resetPassword: (id: number, password: string) => request<void>(`/admins/${id}/password`, { method: 'POST', body: { password } }),
};

const adminsKey = ['admins'] as const;

/** Not polled: the page holds password forms, and the list only changes when someone acts on it. */
export function useAdmins() {
    return useLiveQuery({ queryKey: adminsKey, queryFn: ({ signal }) => adminsApi.list(signal), errorBanner: 'message' });
}

/** A change to the admin list; the list reloads once it lands. */
function useAdminMutation<V>(mutationFn: (vars: V) => Promise<void>) {
    const queryClient = useQueryClient();
    return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: adminsKey }) });
}

export const useCreateAdmin = () => useAdminMutation((v: { username: string; password: string }) => adminsApi.create(v.username, v.password));
export const useRemoveAdmin = () => useAdminMutation((row: AdminRow) => adminsApi.remove(row.id));
export const useResetPassword = () => useAdminMutation((v: { id: number; password: string }) => adminsApi.resetPassword(v.id, v.password));
/** Also refreshes the list: it ends the admin's other sessions. */
export const useChangeOwnPassword = () => useAdminMutation((v: { current: string; password: string }) => authApi.changePassword(v.current, v.password));
