import React from 'react';
import { Navbar, Nav, Container, Button, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        <Navbar.Brand as={Link} to="/">
          StudiMove Hotel
        </Navbar.Brand>
        
        {isAuthenticated && (
          <>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link as={Link} to="/">Accueil</Nav.Link>
                <Nav.Link as={Link} to="/hotels">Hôtels</Nav.Link>
                
                {user?.role === 'admin' && (
                  <NavDropdown title="Administration" id="admin-nav-dropdown">
                    <NavDropdown.Item as={Link} to="/admin/users">
                      Gestion des utilisateurs
                    </NavDropdown.Item>
                    <NavDropdown.Item as={Link} to="/admin/hotels">
                      Gestion des hôtels
                    </NavDropdown.Item>
                  </NavDropdown>
                )}
              </Nav>
              <Nav>
                <Navbar.Text className="me-3">
                  Connecté en tant que: {user?.name} 
                  {user?.role === 'admin' && (
                    <span className="badge bg-danger ms-2">Admin</span>
                  )}
                </Navbar.Text>
                <Button variant="outline-light" onClick={handleLogout}>
                  Déconnexion
                </Button>
              </Nav>
            </Navbar.Collapse>
          </>
        )}
      </Container>
    </Navbar>
  );
};

export default Header;
