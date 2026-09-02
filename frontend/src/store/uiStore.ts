import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  /** Whether the side navigation is showing icons-only (collapsed) or icons + labels (expanded). */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/**
 * Small, dedicated UI-preferences store — separate from authStore so purely cosmetic,
 * per-browser preferences (like the sidebar's collapsed state) don't get tangled up with
 * session/auth state. Persisted to localStorage so the choice survives page navigations,
 * refreshes, and returning in a later session, the same way it would in Slack or Outlook.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'innocito-ui-preferences' }
  )
);
