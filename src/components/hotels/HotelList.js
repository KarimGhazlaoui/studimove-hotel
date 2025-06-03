import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Table, Button, Alert, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';

const HotelList = () => {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHotels = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/hotels');
        
        if (res.data && res.data.data) {
          setHotels(res.data.data);
        } else if (res.data && Array.isArray(res.data)) {
          setHotels(res.data);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Erreur lors du chargement des hôtels:', err);
        setError(`Erreur lors du chargement des hôtels: ${err.message}`);
        setLoading(false);
      }
    };

    fetchHotels();
  }, []);

  const handleDelete = async (id, hotelName) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer l'hôtel "${hotelName}" ?`)) {
      try {
        await axios.delete(`/api/hotels/${id}`);
        setHotels(hotels.filter(hotel => hotel._id !== id));
        toast.success('Hôtel supprimé avec succès');
      } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        toast.error('Erreur lors de la suppression de l\'hôtel');
      }
    }
  };

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
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Liste des Hôtels</h1>
        <Link to="/hotels/add" className="btn btn-success">
          Ajouter un hôtel
        </Link>
      </div>

      {hotels.length === 0 ? (
        <Alert variant="info">Aucun hôtel trouvé.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Localisation</th>
              <th>Pays</th>
              <th>Catégorie</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hotels.map(hotel => (
              <tr key={hotel._id}>
                <td>{hotel.name}</td>
                <td>{hotel.location}</td>
                <td>{hotel.country}</td>
                <td>{hotel.category}</td>
                <td>
                  <Link to={`/hotels/${hotel._id}`} className="btn btn-info btn-sm me-1">
                    Détails
                  </Link>
                  <Link to={`/hotels/edit/${hotel._id}`} className="btn btn-warning btn-sm me-1">
                    Modifier
                  </Link>
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={() => handleDelete(hotel._id, hotel.name)}
                  >
                    Supprimer
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
};

export default HotelList;
