import React from 'react';
import { Container, Row, Col, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <Container className="mt-5">
      <Row>
        <Col md={{ span: 6, offset: 3 }}>
          <Alert variant="danger">
            <Alert.Heading>Page non trouvée</Alert.Heading>
            <p>La page que vous recherchez n'existe pas.</p>
            <hr />
            <p className="mb-0">
              <Link to="/">Retour à l'accueil</Link>
            </p>
          </Alert>
        </Col>
      </Row>
    </Container>
  );
};

export default NotFound;
