import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';

const Footer = () => {
  return (
    <footer className="bg-dark text-white py-3 mt-auto">
      <Container>
        <Row>
          <Col className="text-center">
            <p className="mb-0">
              &copy; {new Date().getFullYear()} StudiMove Hôtel - Application interne
            </p>
          </Col>
        </Row>
      </Container>
    </footer>
  );
};

export default Footer;
