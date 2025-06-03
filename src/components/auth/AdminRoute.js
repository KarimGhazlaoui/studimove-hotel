import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Alert, Container } from 'react-bootstrap';

const AdminRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user?.role !== 'admin') {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Accès refusé</Alert.Heading>
          <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        </Alert>
      </Container>
    );
  }

  return children;
};

export default AdminRoute;