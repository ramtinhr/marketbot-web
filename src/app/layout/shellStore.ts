import { create } from 'zustand';

interface ShellState {
    /** The mobile drawer. */
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useShellStore = create<ShellState>()((set) => ({
    sidebarOpen: false,
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

// app.css drives the mobile drawer off body.sidebar-open.
useShellStore.subscribe((s) => document.body.classList.toggle('sidebar-open', s.sidebarOpen));
