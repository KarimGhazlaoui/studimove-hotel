import React, { useState, useEffect } from 'react';
import { Container, Card, Button, Row, Col, Alert, Spinner } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaEdit } from 'react-icons/fa';
import axios from 'axios';

const HotelDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHotelDetails = async () => {
      try {
        setLoading(true);
        console.log(`Tentative de récupération de l'hôtel avec l'ID: ${id}`);
        
        const res = await axios.get(`/api/hotels/${id}`);
        console.log('Réponse API:', res);
        
        // Vérifier si les données existent
        if (res.data && (res.data.data || res.data)) {
          // Adapter selon la structure de votre API
          const hotelData = res.data.data || res.data;
          setHotel(hotelData);
        } else {
          throw new Error('Données introuvables');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Erreur lors du chargement des détails:', err);
        setError(`Erreur lors du chargement des détails de l'hôtel: ${err.message}`);
        setLoading(false);
      }
    };

    fetchHotelDetails();
  }, [id]);

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Chargement...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Button 
          variant="secondary" 
          className="mb-4"
          onClick={() => navigate('/hotels')}
        >
          <FaArrowLeft className="me-1" /> Retour à la liste
        </Button>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  if (!hotel) {
    return (
      <Container className="mt-4">
        <Button 
          variant="secondary" 
          className="mb-4"
          onClick={() => navigate('/hotels')}
        >
          <FaArrowLeft className="me-1" /> Retour à la liste
        </Button>
        <Alert variant="warning">Hôtel non trouvé</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Button 
        variant="secondary" 
        className="mb-4"
        onClick={() => navigate('/hotels')}
      >
        <FaArrowLeft className="me-1" /> Retour à la liste
      </Button>
      
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h2>{hotel.name}</h2>
          <Button 
            variant="warning"
            onClick={() => navigate(`/hotels/edit/${id}`)}
          >
            <FaEdit className="me-1" /> Modifier
          </Button>
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <p><strong>Description:</strong> {hotel.description || 'Non spécifiée'}</p>
              <p><strong>Adresse:</strong> {hotel.address || 'Non spécifiée'}</p>
              <p><strong>Localisation:</strong> {hotel.location || 'Non spécifiée'}</p>
              <p><strong>Pays:</strong> {hotel.country || 'Non spécifié'}</p>
            </Col>
            <Col md={6}>
              <p><strong>Catégorie:</strong> {hotel.category || 'Non spécifiée'}</p>
              <p><strong>Email:</strong> {hotel.email || 'Non spécifié'}</p>
              <p><strong>Téléphone:</strong> {hotel.phone || 'Non spécifié'}</p>
              <p><strong>Note:</strong> {hotel.rating ? `${hotel.rating}/5` : 'Non notée'}</p>
              {hotel.website && (
                <p>
                  <strong>Site web:</strong>{' '}
                  <a href={hotel.website} target="_blank" rel="noopener noreferrer">
                    {hotel.website}
                  </a>
                </p>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default HotelDetail;
