import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { I18nProvider } from './i18n';
import { AuthProvider, RequireAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import Login from './pages/Login';

// One chunk per page: ECharts alone is ~1MB and only the statistics page needs it.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Statistics = lazy(() => import('./pages/Statistics'));
const Market = lazy(() => import('./pages/Market'));
const ManualTrade = lazy(() => import('./pages/ManualTrade'));
const Incidents = lazy(() => import('./pages/Incidents'));
const Balances = lazy(() => import('./pages/Balances'));
const Reconciliation = lazy(() => import('./pages/Reconciliation'));
const Profit = lazy(() => import('./pages/Profit'));
const Orders = lazy(() => import('./pages/Orders'));
const Opportunities = lazy(() => import('./pages/Opportunities'));
const MissedOpportunities = lazy(() => import('./pages/MissedOpportunities'));
const OrderAudit = lazy(() => import('./pages/OrderAudit'));
const RequestLogs = lazy(() => import('./pages/RequestLogs'));
const Providers = lazy(() => import('./pages/Providers'));
const ProviderEdit = lazy(() => import('./pages/ProviderEdit'));
const Admins = lazy(() => import('./pages/Admins'));

export default function App() {
    return (
        <ThemeProvider>
            <I18nProvider>
                <AuthProvider>
                    <BrowserRouter>
                        <Suspense fallback={null}>
                            <Routes>
                                <Route path="login" element={<Login />} />
                                <Route element={<RequireAuth><Layout /></RequireAuth>}>
                                    <Route index element={<Navigate to="/dashboard" replace />} />
                                    <Route path="dashboard" element={<Dashboard />} />
                                    <Route path="statistics" element={<Statistics />} />
                                    <Route path="market" element={<Market />} />
                                    <Route path="manual-trade" element={<ManualTrade />} />
                                    <Route path="incidents" element={<Incidents />} />
                                    <Route path="balances" element={<Balances />} />
                                    <Route path="reconciliation" element={<Reconciliation />} />
                                    <Route path="profit" element={<Profit />} />
                                    <Route path="orders" element={<Orders />} />
                                    <Route path="opportunities" element={<Opportunities />} />
                                    <Route path="missed-opportunities" element={<MissedOpportunities />} />
                                    <Route path="order-audit" element={<OrderAudit />} />
                                    <Route path="request-logs" element={<RequestLogs />} />
                                    <Route path="providers" element={<Providers />} />
                                    <Route path="provider-edit" element={<ProviderEdit />} />
                                    <Route path="admins" element={<Admins />} />
                                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                                </Route>
                            </Routes>
                        </Suspense>
                    </BrowserRouter>
                </AuthProvider>
            </I18nProvider>
        </ThemeProvider>
    );
}
