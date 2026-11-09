/** Separate artifacts share the existing components and styling. */
export const IS_BACKOFFICE = import.meta.env.VITE_PANEL === 'backoffice';
export const HOME_PATH = IS_BACKOFFICE ? '/customers' : '/dashboard';
export const PANEL_NAME = IS_BACKOFFICE ? 'Pars Backoffice' : 'MarketBot';
