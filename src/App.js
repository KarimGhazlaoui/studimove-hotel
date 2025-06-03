import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from './context/AuthContext';

// Components
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Dashboard from './components/Dashboard';
import HotelList from './components/hotels/HotelList';
import HotelDetail from './components/hotels/HotelDetail';
import HotelForm from './components/hotels/HotelForm';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/auth/AdminRoute';
import UserManagement from './components/admin/UserManagement';
import NotFound from './components/NotFound';

function App() {
  return (
    <AuthProvider>
      <div className="d-flex flex-column min-vh-100">
        <Header />
        <main className="py-3 flex-grow-1">
          <Routes>
            {/* Routes publiques */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Routes protégées */}
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/hotels" element={
              <ProtectedRoute>
                <HotelList />
              </ProtectedRoute>
            } />
            <Route path="/hotels/:id" element={
              <ProtectedRoute>
                <HotelDetail />
              </ProtectedRoute>
            } />
            <Route path="/hotels/add" element={
              <ProtectedRoute>
                <HotelForm />
              </ProtectedRoute>
            } />
            <Route path="/hotels/edit/:id" element={
              <ProtectedRoute>
                <HotelForm />
              </ProtectedRoute>
            } />

            {/* Routes admin */}
            <Route path="/admin/users" element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
        <ToastContainer position="bottom-right" />
      </div>
    </AuthProvider>
  );
}

export default App;
