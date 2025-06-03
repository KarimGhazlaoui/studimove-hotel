import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  return (
    <Container className="mt-4">
      <h1>Tableau de bord StudiMove Hôtel</h1>
      <Row className="mt-4">
        <Col md={4}>
          <Card className="mb-4">
            <Card.Body>
              <Card.Title>Gestion des Hôtels</Card.Title>
              <Card.Text>
                Accédez à la liste des hôtels pour consulter, ajouter, modifier ou supprimer des établissements.
              </Card.Text>
              <Link to="/hotels" className="btn btn-primary">
                Voir les hôtels
              </Link>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Dashboard;
