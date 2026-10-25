import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { TicketsList } from './pages/TicketsList';
import { TicketDetail } from './pages/TicketDetail';
import { CreateTicket } from './pages/CreateTicket';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { KBEditor } from './pages/KBEditor';
import { Settings } from './pages/Settings';
import AgentDashboard from './pages/AgentDashboard';
import { MyRequests } from './pages/requests/MyRequests';
import { SubmitRequest } from './pages/requests/SubmitRequest';
import { RequestDetail } from './pages/requests/RequestDetail';
import { AdminOverview } from './pages/admin/AdminOverview';
import { RequestQueue } from './pages/admin/RequestQueue';
import { Inventory } from './pages/admin/Inventory';
import { AssetEditor } from './pages/admin/AssetEditor';
import { Assignments } from './pages/admin/Assignments';
import { History } from './pages/admin/History';
import { useAuthStore } from './stores/auth';

// Landing page depends on role: administrators manage, everyone else requests.
function HomeRedirect() {
  const { user } = useAuthStore();
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/requests'} replace />;
}

const adminOnly = (element: React.ReactNode) => <ProtectedRoute roles={['admin']}>{element}</ProtectedRoute>;

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <Router>
      <div className="App">
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              style: {
                background: '#10B981',
              },
            },
            error: {
              duration: 5000,
              style: {
                background: '#EF4444',
              },
            },
          }}
        />

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRedirect />} />

            <Route path="requests" element={<MyRequests />} />
            <Route path="requests/new" element={<SubmitRequest />} />
            <Route path="requests/:id" element={<RequestDetail />} />

            <Route path="admin" element={adminOnly(<AdminOverview />)} />
            <Route path="admin/requests" element={adminOnly(<RequestQueue />)} />
            <Route path="admin/requests/:id" element={adminOnly(<RequestDetail />)} />
            <Route path="admin/inventory" element={adminOnly(<Inventory />)} />
            <Route path="admin/inventory/new" element={adminOnly(<AssetEditor />)} />
            <Route path="admin/inventory/:id" element={adminOnly(<AssetEditor />)} />
            <Route path="admin/assignments" element={adminOnly(<Assignments />)} />
            <Route path="admin/history" element={adminOnly(<History />)} />

            <Route path="tickets" element={<TicketsList />} />
            <Route 
              path="tickets/new" 
              element={
                <ProtectedRoute roles={['user']}>
                  <CreateTicket />
                </ProtectedRoute>
              } 
            />
            <Route path="tickets/:id" element={<TicketDetail />} />
            
            <Route
              path="agent-dashboard"
              element={
                <ProtectedRoute roles={['agent']}>
                  <AgentDashboard />
                </ProtectedRoute>
              }
            />
            
            <Route path="kb" element={<KnowledgeBase />} />
            <Route
              path="kb/new"
              element={
                <ProtectedRoute roles={['admin']}>
                  <KBEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="kb/:id/edit"
              element={
                <ProtectedRoute roles={['admin']}>
                  <KBEditor />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="settings"
              element={
                <ProtectedRoute roles={['admin']}>
                  <Settings />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}

export default App;