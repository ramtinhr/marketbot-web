import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from '../features/auth/RequireAuth';
import { useAuthStore } from '../features/auth/store';
import { ConfirmHost } from '../shared/ui';
import Layout from './layout/Layout';
import { queryClient } from './queryClient';

// One chunk per page: ECharts alone is ~1MB and only the statistics page needs it.
const Login = lazy(() => import('../features/auth/LoginPage'));
const Dashboard = lazy(() => import('../features/dashboard/DashboardPage'));
const Statistics = lazy(() => import('../features/statistics/StatisticsPage'));
const Market = lazy(() => import('../features/market/MarketPage'));
const ManualTrade = lazy(() => import('../features/manual-trade/ManualTradePage'));
const Incidents = lazy(() => import('../features/incidents/IncidentsPage'));
const Balances = lazy(() => import('../features/balances/BalancesPage'));
const Reconciliation = lazy(() => import('../features/reconciliation/ReconciliationPage'));
const Profit = lazy(() => import('../features/profit/ProfitPage'));
const Orders = lazy(() => import('../features/orders/OrdersPage'));
const Opportunities = lazy(() => import('../features/opportunities/OpportunitiesPage'));
const MissedOpportunities = lazy(() => import('../features/missed/MissedOpportunitiesPage'));
const OrderAudit = lazy(() => import('../features/order-audit/OrderAuditPage'));
const RequestLogs = lazy(() => import('../features/request-logs/RequestLogsPage'));
const Providers = lazy(() => import('../features/providers/ProvidersPage'));
const ProviderEdit = lazy(() => import('../features/providers/ProviderEditPage'));
const Admins = lazy(() => import('../features/admins/AdminsPage'));

export default function App() {
    useEffect(() => { void useAuthStore.getState().restore(); }, []);

    return (
        <QueryClientProvider client={queryClient}>
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
            <ConfirmHost />
        </QueryClientProvider>
    );
}
