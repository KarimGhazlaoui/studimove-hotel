import React, { useState, useEffect, useCallback } from 'react';
import { Container, Form, Button, Card, Alert, Row, Col } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import axios from 'axios';

const HotelForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    description: '',
    price: '',
    rating: '',
    amenities: '',
    images: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHotel = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/hotels/${id}`);
      
      if (response.data.success) {
        const hotel = response.data.data;
        setFormData({
          name: hotel.name || '',
          address: hotel.address || '',
          city: hotel.city || '',
          country: hotel.country || '',
          phone: hotel.phone || '',
          email: hotel.email || '',
          website: hotel.website || '',
          description: hotel.description || '',
          price: hotel.price || '',
          rating: hotel.rating || '',
          amenities: Array.isArray(hotel.amenities) ? hotel.amenities.join(', ') : '',
          images: Array.isArray(hotel.images) ? hotel.images.join(', ') : ''
        });
      }
    } catch (error) {
      console.error('Erreur lors du chargement de l\'hôtel:', error);
      setError('Erreur lors du chargement de l\'hôtel');
      toast.error('Erreur lors du chargement de l\'hôtel');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isEdit) {
      fetchHotel();
    }
  }, [isEdit, fetchHotel]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Préparer les données
      const hotelData = {
        ...formData,
        price: Number(formData.price) || 0,
        rating: Number(formData.rating) || 0,
        amenities: formData.amenities.split(',').map(item => item.trim()).filter(item => item),
        images: formData.images.split(',').map(item => item.trim()).filter(item => item)
      };

      let response;
      
      if (isEdit) {
        response = await axios.put(`/api/hotels/${id}`, hotelData);
      } else {
        response = await axios.post('/api/hotels', hotelData);
      }

      if (response.data.success) {
        toast.success(isEdit ? 'Hôtel modifié avec succès' : 'Hôtel créé avec succès');
        navigate('/hotels');
      }
    } catch (error) {
      console.error('Erreur:', error);
      const errorMessage = error.response?.data?.message || 'Erreur lors de l\'opération';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEdit) {
    return (
      <Container className="mt-4 text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Chargement...</span>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Card>
        <Card.Header>
          <h2>{isEdit ? 'Modifier l\'hôtel' : 'Ajouter un hôtel'}</h2>
        </Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          
          <Form onSubmit={handleSubmit}>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Nom de l'hôtel *</Form.Label>
                  <Form.Control
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Entrez le nom de l'hôtel"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Prix par nuit (€) *</Form.Label>
                  <Form.Control
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    required
                    min="0"
                    step="0.01"
                    placeholder="99.99"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={8}>
                <Form.Group className="mb-3">
                  <Form.Label>Adresse *</Form.Label>
                  <Form.Control
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    placeholder="123 Rue de la Paix"
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Note (1-5)</Form.Label>
                  <Form.Control
                    type="number"
                    name="rating"
                    value={formData.rating}
                    onChange={handleChange}
                    min="1"
                    max="5"
                    step="0.1"
                    placeholder="4.5"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Ville *</Form.Label>
                  <Form.Control
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                    placeholder="Paris"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Pays *</Form.Label>
                  <Form.Control
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    required
                    placeholder="France"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Téléphone</Form.Label>
                  <Form.Control
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+33 1 23 45 67 89"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="contact@hotel.com"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Site web</Form.Label>
              <Form.Control
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://www.hotel.com"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Description de l'hôtel..."
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Équipements (séparés par des virgules)</Form.Label>
              <Form.Control
                type="text"
                name="amenities"
                value={formData.amenities}
                onChange={handleChange}
                placeholder="WiFi, Piscine, Climatisation, Parking"
              />
              <Form.Text className="text-muted">
                Exemple: WiFi, Piscine, Restaurant, Spa, Parking gratuit
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Images (URLs séparées par des virgules)</Form.Label>
              <Form.Control
                type="text"
                name="images"
                value={formData.images}
                onChange={handleChange}
                placeholder="https://exemple.com/image1.jpg, https://exemple.com/image2.jpg"
              />
              <Form.Text className="text-muted">
                Entrez les URLs des images séparées par des virgules
              </Form.Text>
            </Form.Group>

            <div className="d-flex gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Enregistrement...' : (isEdit ? 'Modifier' : 'Créer')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/hotels')}
              >
                Annuler
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default HotelForm;
